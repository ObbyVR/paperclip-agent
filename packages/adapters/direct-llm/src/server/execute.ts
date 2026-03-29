import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  resolveRoute,
  getNextFallback,
  markRateLimited,
  estimateCost,
  classifyTaskComplexity,
  complexityToTier,
  type ModelSpec,
  type Tier,
  type RouteResult,
} from "./router.js";

// ---------------------------------------------------------------------------
// OpenAI-compatible API types (used by OpenRouter and OpenAI native)
// ---------------------------------------------------------------------------

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LLMChoice {
  message: { role: string; content: string };
  finish_reason: string;
}

interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface LLMResponse {
  id: string;
  model: string;
  choices: LLMChoice[];
  usage: LLMUsage;
}

// ---------------------------------------------------------------------------
// Anthropic native API types
// ---------------------------------------------------------------------------

interface AnthropicContentBlock {
  type: "text";
  text: string;
}

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ---------------------------------------------------------------------------
// LLM API callers
// ---------------------------------------------------------------------------

async function callOpenRouter(
  model: ModelSpec,
  messages: LLMMessage[],
  config: {
    apiKey: string;
    maxTokens: number;
    temperature: number;
    timeoutMs: number;
  },
): Promise<{ response: LLMResponse; rawBody: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "X-Title": "Paperclip Direct LLM",
        "HTTP-Referer": "https://paperclip.ing",
      },
      body: JSON.stringify({
        model: model.id,
        messages,
        max_tokens: Math.min(config.maxTokens, model.maxOutput),
        temperature: config.temperature,
      }),
      signal: controller.signal,
    });

    const rawBody = await res.text();

    if (!res.ok) {
      if (res.status === 429) {
        markRateLimited(model.provider);
      }
      throw new Error(`OpenRouter ${res.status}: ${rawBody.slice(0, 500)}`);
    }

    const response = JSON.parse(rawBody) as LLMResponse;
    return { response, rawBody };
  } finally {
    clearTimeout(timeout);
  }
}

async function callAnthropicDirect(
  model: ModelSpec,
  messages: LLMMessage[],
  config: {
    apiKey: string;
    maxTokens: number;
    temperature: number;
    timeoutMs: number;
  },
): Promise<{ response: LLMResponse; rawBody: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  const systemMsg = messages.find((m) => m.role === "system");
  const userMessages = messages.filter((m) => m.role !== "system");
  const nativeModelId = model.nativeModelId ?? model.id.replace("anthropic/", "");

  try {
    const body: Record<string, unknown> = {
      model: nativeModelId,
      messages: userMessages,
      max_tokens: Math.min(config.maxTokens, model.maxOutput),
      temperature: config.temperature,
    };
    if (systemMsg) {
      body.system = systemMsg.content;
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const rawBody = await res.text();

    if (!res.ok) {
      if (res.status === 429) {
        markRateLimited(model.provider);
      }
      throw new Error(`Anthropic API ${res.status}: ${rawBody.slice(0, 500)}`);
    }

    const native = JSON.parse(rawBody) as AnthropicResponse;
    // Normalize to OpenAI-compatible shape
    const response: LLMResponse = {
      id: native.id,
      model: native.model,
      choices: [{
        message: { role: "assistant", content: native.content[0]?.text ?? "" },
        finish_reason: "stop",
      }],
      usage: {
        prompt_tokens: native.usage.input_tokens,
        completion_tokens: native.usage.output_tokens,
        total_tokens: native.usage.input_tokens + native.usage.output_tokens,
      },
    };
    return { response, rawBody };
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAIDirect(
  model: ModelSpec,
  messages: LLMMessage[],
  config: {
    apiKey: string;
    maxTokens: number;
    temperature: number;
    timeoutMs: number;
  },
): Promise<{ response: LLMResponse; rawBody: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const nativeModelId = model.nativeModelId ?? model.id.replace("openai/", "");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: nativeModelId,
        messages,
        max_tokens: Math.min(config.maxTokens, model.maxOutput),
        temperature: config.temperature,
      }),
      signal: controller.signal,
    });

    const rawBody = await res.text();

    if (!res.ok) {
      if (res.status === 429) {
        markRateLimited(model.provider);
      }
      throw new Error(`OpenAI API ${res.status}: ${rawBody.slice(0, 500)}`);
    }

    const response = JSON.parse(rawBody) as LLMResponse;
    return { response, rawBody };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function parseEnvVars(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1);
  }
  return env;
}

function asString(val: unknown, fallback: string): string {
  return typeof val === "string" && val.length > 0 ? val : fallback;
}

function asNumber(val: unknown, fallback: number): number {
  const n = typeof val === "number" ? val : Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(val: unknown, fallback: boolean): boolean {
  if (typeof val === "boolean") return val;
  if (val === "true") return true;
  if (val === "false") return false;
  return fallback;
}

// ---------------------------------------------------------------------------
// Main execute function
// ---------------------------------------------------------------------------

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, config, context, onLog } = ctx;

  // Read config
  const modelSelector = asString(config.model, "auto");
  const tierOverride = asString(config.tier, "");
  const maxTokens = asNumber(config.maxTokens, 4096);
  const temperature = asNumber(config.temperature, 0.7);
  const systemPrompt = asString(config.systemPrompt, "");
  const fallbackEnabled = asBoolean(config.fallbackEnabled, true);
  const budgetPerRunUsd = asNumber(config.budgetPerRunUsd, 0.50);
  const timeoutSec = asNumber(config.timeoutSec, 120);

  // Resolve API keys from config.env (create mode, parsed object),
  // config.envVars (edit mode, raw KEY=VALUE string), or process.env.
  const envConfig =
    typeof config.env === "object" && config.env !== null
      ? config.env as Record<string, string>
      : typeof config.envVars === "string" && config.envVars
      ? parseEnvVars(config.envVars)
      : {};
  const openrouterKey = envConfig.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "";
  const anthropicKey = envConfig.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "";
  const openaiKey = envConfig.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";

  if (!openrouterKey && !anthropicKey && !openaiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "No API key found. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in agent env.",
      errorCode: "missing_api_key",
    };
  }

  // Extract context fields for prompt interpolation
  const taskId = asString(context.taskId ?? context.issueId, "");
  const wakeReason = asString(context.wakeReason, "");
  const wakeCommentId = asString(context.wakeCommentId ?? context.commentId, "");
  const approvalStatus = asString(context.approvalStatus, "");
  const issueTitle = asString(context.issueTitle, "");
  const issueDescription = asString(context.issueDescription, "");

  // ---------------------------------------------------------------------------
  // Optional URL fetch: if config.fetchUrl is true, extract URL from issue
  // description and fetch its HTML content for the LLM to analyze.
  // ---------------------------------------------------------------------------
  const fetchUrlEnabled = asBoolean(config.fetchUrl, false);
  let fetchedContent = "";
  if (fetchUrlEnabled && issueDescription) {
    const urlMatch = issueDescription.match(/https?:\/\/[^\s<>"]+/);
    if (urlMatch) {
      const targetUrl = urlMatch[0];
      await onLog("stdout", JSON.stringify({
        type: "fetch_url",
        url: targetUrl,
        status: "fetching",
      }) + "\n");
      try {
        const fetchController = new AbortController();
        const fetchTimeout = setTimeout(() => fetchController.abort(), 15000);
        const fetchRes = await fetch(targetUrl, {
          signal: fetchController.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PaperclipBot/1.0)" },
        });
        clearTimeout(fetchTimeout);
        const html = await fetchRes.text();
        // Truncate to avoid blowing up the context window (max ~30k chars)
        fetchedContent = html.slice(0, 30000);
        await onLog("stdout", JSON.stringify({
          type: "fetch_url",
          url: targetUrl,
          status: "ok",
          length: fetchedContent.length,
        }) + "\n");
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : "Unknown fetch error";
        await onLog("stderr", JSON.stringify({
          type: "fetch_url",
          url: targetUrl,
          status: "error",
          error: msg,
        }) + "\n");
      }
    }
  }

  // Build prompt from context
  const DEFAULT_PROMPT_TEMPLATE = [
    "You are {{agent.name}} (id: {{agent.id}}), an AI agent running inside Paperclip.",
    "{{#taskId}}Task: {{taskId}}{{/taskId}}",
    "{{#wakeReason}}Wake reason: {{wakeReason}}{{/wakeReason}}",
    "{{#wakeCommentId}}Comment ref: {{wakeCommentId}}{{/wakeCommentId}}",
    "{{#approvalStatus}}Approval status: {{approvalStatus}}{{/approvalStatus}}",
    "{{#issueTitle}}Issue: {{issueTitle}}{{/issueTitle}}",
    "{{#issueDescription}}Description: {{issueDescription}}{{/issueDescription}}",
    "",
    "Complete your assigned task. Be concise and output only the result.",
  ].join("\n");

  const promptTemplate = asString(config.promptTemplate, DEFAULT_PROMPT_TEMPLATE);

  const allVars: Record<string, string> = {
    taskId, wakeReason, wakeCommentId, approvalStatus,
    issueTitle, issueDescription, fetchedContent,
  };

  const prompt = promptTemplate
    .replace(/\{\{agent\.id\}\}/g, agent.id)
    .replace(/\{\{agent\.name\}\}/g, agent.name)
    .replace(/\{\{taskId\}\}/g, taskId)
    .replace(/\{\{wakeReason\}\}/g, wakeReason)
    .replace(/\{\{wakeCommentId\}\}/g, wakeCommentId)
    .replace(/\{\{approvalStatus\}\}/g, approvalStatus)
    .replace(/\{\{issueTitle\}\}/g, issueTitle)
    .replace(/\{\{issueDescription\}\}/g, issueDescription)
    .replace(/\{\{fetchedContent\}\}/g, fetchedContent)
    // Remove conditional blocks {{#field}}...{{/field}} when field is empty
    .replace(/\{\{#\w+\}\}[^\n]*\{\{\/\w+\}\}\n?/g, (match) => {
      const inner = match.match(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\w+\}\}/);
      if (!inner) return "";
      const fieldName = inner[1];
      return allVars[fieldName] ? inner[2].trim() + "\n" : "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Resolve which model to use
  const effectiveSelector = tierOverride
    ? `auto:${tierOverride}`
    : modelSelector;

  let route = resolveRoute(effectiveSelector, prompt);
  const complexity = classifyTaskComplexity(prompt);
  const resolvedTier = tierOverride as Tier || route.tier;

  await onLog("stdout", JSON.stringify({
    type: "routing",
    tier: resolvedTier,
    complexity,
    model: route.model.id,
    isAutoRouted: route.isAutoRouted,
    estimatedInputCost: `$${route.model.inputCostPer1M}/M`,
    estimatedOutputCost: `$${route.model.outputCostPer1M}/M`,
  }) + "\n");

  // Build messages
  const messages: LLMMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  // ---------------------------------------------------------------------------
  // Helper: pick the best caller for a model given available keys
  // ---------------------------------------------------------------------------
  function resolveCallerAndKey(model: ModelSpec): {
    caller: "anthropic" | "openai" | "openrouter";
    key: string;
  } {
    if (model.nativeProvider === "anthropic" && anthropicKey) {
      return { caller: "anthropic", key: anthropicKey };
    }
    if (model.nativeProvider === "openai" && openaiKey) {
      return { caller: "openai", key: openaiKey };
    }
    if (openrouterKey) {
      return { caller: "openrouter", key: openrouterKey };
    }
    // No valid key found for this model path
    throw new Error(
      `No API key available for model ${model.id}. ` +
      `Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.`,
    );
  }

  // Execute with fallback cascade
  let lastError: string | null = null;
  let currentModel = route.model;
  let attemptIndex = 0;
  const maxAttempts = fallbackEnabled ? 4 : 1;
  let totalCostUsd = 0;

  while (attemptIndex < maxAttempts) {
    try {
      const { caller, key: callKey } = resolveCallerAndKey(currentModel);

      await onLog("stdout", JSON.stringify({
        type: "attempt",
        attempt: attemptIndex + 1,
        model: currentModel.id,
        provider: currentModel.provider,
        via: caller,
      }) + "\n");

      const callConfig = {
        apiKey: callKey,
        maxTokens,
        temperature,
        timeoutMs: timeoutSec * 1000,
      };

      let response: LLMResponse;
      if (caller === "anthropic") {
        ({ response } = await callAnthropicDirect(currentModel, messages, callConfig));
      } else if (caller === "openai") {
        ({ response } = await callOpenAIDirect(currentModel, messages, callConfig));
      } else {
        ({ response } = await callOpenRouter(currentModel, messages, callConfig));
      }

      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;
      const costUsd = estimateCost(currentModel, inputTokens, outputTokens);
      totalCostUsd += costUsd;

      // Budget check
      if (totalCostUsd > budgetPerRunUsd) {
        await onLog("stderr", `[direct-llm] Budget exceeded: $${totalCostUsd.toFixed(4)} > $${budgetPerRunUsd}\n`);
      }

      const content = response.choices?.[0]?.message?.content ?? "";

      await onLog("stdout", JSON.stringify({
        type: "result",
        model: response.model || currentModel.id,
        provider: currentModel.provider,
        via: caller,
        tier: resolvedTier,
        inputTokens,
        outputTokens,
        costUsd: Math.round(costUsd * 10000) / 10000,
        isAutoRouted: route.isAutoRouted,
        complexity,
        contentLength: content.length,
      }) + "\n");

      // Output the actual content
      await onLog("stdout", content);

      return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        usage: {
          inputTokens,
          outputTokens,
        },
        provider: currentModel.provider,
        model: response.model || currentModel.id,
        billingType: "api",
        costUsd: Math.round(totalCostUsd * 10000) / 10000,
        summary: content.slice(0, 500),
        resultJson: {
          tier: resolvedTier,
          complexity,
          isAutoRouted: route.isAutoRouted,
          attempts: attemptIndex + 1,
          model: response.model || currentModel.id,
          via: caller,
          content,
        },
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await onLog("stderr", `[direct-llm] Attempt ${attemptIndex + 1} failed (${currentModel.id}): ${lastError}\n`);

      // Try next fallback
      if (fallbackEnabled) {
        const next = getNextFallback(resolvedTier, attemptIndex);
        if (next) {
          currentModel = next;
          attemptIndex++;
          await onLog("stdout", JSON.stringify({
            type: "fallback",
            from: currentModel.id,
            to: next.id,
            reason: lastError.slice(0, 200),
          }) + "\n");
          continue;
        }
      }
      break;
    }
  }

  return {
    exitCode: 1,
    signal: null,
    timedOut: false,
    errorMessage: `All attempts failed. Last error: ${lastError}`,
    errorCode: "all_attempts_failed",
    resultJson: {
      tier: resolvedTier,
      complexity,
      attempts: attemptIndex + 1,
      lastError,
    },
  };
}

// ---------------------------------------------------------------------------
// Environment test
// ---------------------------------------------------------------------------

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentTestResult["checks"] = [];

  const envConfig = typeof ctx.config.env === "object" && ctx.config.env !== null
    ? ctx.config.env as Record<string, string>
    : {};
  const openrouterKey = envConfig.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "";
  const anthropicKey = envConfig.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "";
  const openaiKey = envConfig.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  const hasAnyKey = openrouterKey || anthropicKey || openaiKey;

  if (!hasAnyKey) {
    checks.push({
      code: "api_keys",
      level: "error",
      message: "No API key configured",
      hint: "Set at least one of: OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY",
    });
  } else {
    if (openrouterKey) {
      checks.push({ code: "openrouter_api_key", level: "info", message: "OPENROUTER_API_KEY is configured (multi-provider fallback)" });
    }
    if (anthropicKey) {
      checks.push({ code: "anthropic_api_key", level: "info", message: "ANTHROPIC_API_KEY is configured (direct, no markup)" });
    }
    if (openaiKey) {
      checks.push({ code: "openai_api_key", level: "info", message: "OPENAI_API_KEY is configured (direct, no markup)" });
    }

    // Quick connectivity check on OpenRouter if available
    if (openrouterKey) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${openrouterKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          checks.push({ code: "openrouter_connectivity", level: "info", message: "OpenRouter API is reachable" });
        } else {
          checks.push({ code: "openrouter_connectivity", level: "warn", message: `OpenRouter returned ${res.status}`, hint: "Check your API key" });
        }
      } catch {
        checks.push({ code: "openrouter_connectivity", level: "warn", message: "Could not reach OpenRouter API", hint: "Check your internet connection" });
      }
    }
  }

  const hasError = checks.some((c) => c.level === "error");
  const hasWarn = checks.some((c) => c.level === "warn");

  return {
    adapterType: "direct_llm",
    status: hasError ? "fail" : hasWarn ? "warn" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
