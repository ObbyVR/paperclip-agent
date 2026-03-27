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
// OpenRouter API types
// ---------------------------------------------------------------------------

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterChoice {
  message: { role: string; content: string };
  finish_reason: string;
}

interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenRouterResponse {
  id: string;
  model: string;
  choices: OpenRouterChoice[];
  usage: OpenRouterUsage;
}

// ---------------------------------------------------------------------------
// LLM API caller
// ---------------------------------------------------------------------------

async function callOpenRouter(
  model: ModelSpec,
  messages: OpenRouterMessage[],
  config: {
    apiKey: string;
    maxTokens: number;
    temperature: number;
    timeoutMs: number;
  },
): Promise<{ response: OpenRouterResponse; rawBody: string }> {
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

    const response = JSON.parse(rawBody) as OpenRouterResponse;
    return { response, rawBody };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

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

  // Resolve API key from config.env or process.env
  const envConfig = typeof config.env === "object" && config.env !== null
    ? config.env as Record<string, string>
    : {};
  const apiKey =
    envConfig.OPENROUTER_API_KEY ??
    process.env.OPENROUTER_API_KEY ??
    "";

  if (!apiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "OPENROUTER_API_KEY not set. Configure it in agent env or server environment.",
      errorCode: "missing_api_key",
    };
  }

  // Build prompt from context
  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Complete your assigned Paperclip task.",
  );
  const prompt = promptTemplate
    .replace(/\{\{agent\.id\}\}/g, agent.id)
    .replace(/\{\{agent\.name\}\}/g, agent.name);

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
  const messages: OpenRouterMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  // Execute with fallback cascade
  let lastError: string | null = null;
  let currentModel = route.model;
  let attemptIndex = 0;
  const maxAttempts = fallbackEnabled ? 4 : 1;
  let totalCostUsd = 0;

  while (attemptIndex < maxAttempts) {
    try {
      await onLog("stdout", JSON.stringify({
        type: "attempt",
        attempt: attemptIndex + 1,
        model: currentModel.id,
        provider: currentModel.provider,
      }) + "\n");

      const { response } = await callOpenRouter(currentModel, messages, {
        apiKey,
        maxTokens,
        temperature,
        timeoutMs: timeoutSec * 1000,
      });

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
  const apiKey =
    envConfig.OPENROUTER_API_KEY ??
    process.env.OPENROUTER_API_KEY ??
    "";

  if (!apiKey) {
    checks.push({
      code: "openrouter_api_key",
      level: "error",
      message: "OPENROUTER_API_KEY is not set",
      hint: "Set OPENROUTER_API_KEY in the agent environment or server env. Get one at https://openrouter.ai/keys",
    });
  } else {
    checks.push({
      code: "openrouter_api_key",
      level: "info",
      message: "OPENROUTER_API_KEY is configured",
    });

    // Quick connectivity check
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        checks.push({
          code: "openrouter_connectivity",
          level: "info",
          message: "OpenRouter API is reachable",
        });
      } else {
        checks.push({
          code: "openrouter_connectivity",
          level: "warn",
          message: `OpenRouter returned ${res.status}`,
          hint: "Check your API key and account status at https://openrouter.ai",
        });
      }
    } catch {
      checks.push({
        code: "openrouter_connectivity",
        level: "warn",
        message: "Could not reach OpenRouter API",
        hint: "Check your internet connection",
      });
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
