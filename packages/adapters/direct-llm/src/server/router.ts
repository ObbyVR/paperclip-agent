/**
 * Tier-based model router with fallback cascade.
 * Ported from the Python model_router.py — our key differentiator.
 */

export type Tier = "free" | "cheap" | "medium" | "premium";

export interface ModelSpec {
  id: string; // OpenRouter model ID (e.g. "anthropic/claude-sonnet-4-6")
  provider: string;
  label: string;
  inputCostPer1M: number; // USD per 1M input tokens
  outputCostPer1M: number; // USD per 1M output tokens
  maxContext: number;
  maxOutput: number;
  /** Direct API provider, enables bypass of OpenRouter when the native key is set */
  nativeProvider?: "anthropic" | "openai";
  /** Model ID for the native provider API (differs from OpenRouter ID) */
  nativeModelId?: string;
}

export interface TierCascade {
  primary: ModelSpec;
  fallbacks: ModelSpec[];
}

// ---------------------------------------------------------------------------
// Model catalog — prices from OpenRouter as of 2026-03
// ---------------------------------------------------------------------------

const MODELS: Record<string, ModelSpec> = {
  // Free tier — verified against OpenRouter /api/v1/models 2026-03-27
  "meta-llama/llama-3.3-70b-instruct:free": {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    provider: "meta-llama",
    label: "Llama 3.3 70B (Free)",
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    maxContext: 65536,
    maxOutput: 8192,
  },
  "google/gemma-3-27b-it:free": {
    id: "google/gemma-3-27b-it:free",
    provider: "google",
    label: "Gemma 3 27B (Free)",
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    maxContext: 131072,
    maxOutput: 8192,
  },
  "mistralai/mistral-small-3.1-24b-instruct:free": {
    id: "mistralai/mistral-small-3.1-24b-instruct:free",
    provider: "mistralai",
    label: "Mistral Small 3.1 (Free)",
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    maxContext: 128000,
    maxOutput: 8192,
  },

  // Cheap tier
  "deepseek/deepseek-chat-v3-0324": {
    id: "deepseek/deepseek-chat-v3-0324",
    provider: "deepseek",
    label: "DeepSeek V3",
    inputCostPer1M: 0.20,
    outputCostPer1M: 0.77,
    maxContext: 131072,
    maxOutput: 8192,
  },
  "openai/gpt-4.1-mini": {
    id: "openai/gpt-4.1-mini",
    provider: "openai",
    label: "GPT-4.1 Mini",
    inputCostPer1M: 0.40,
    outputCostPer1M: 1.60,
    maxContext: 1048576,
    maxOutput: 32768,
    nativeProvider: "openai",
    nativeModelId: "gpt-4.1-mini",
  },
  "anthropic/claude-haiku-4.5": {
    id: "anthropic/claude-haiku-4.5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    inputCostPer1M: 1.0,
    outputCostPer1M: 5.0,
    maxContext: 200000,
    maxOutput: 8192,
    nativeProvider: "anthropic",
    nativeModelId: "claude-haiku-4-5-20251001",
  },

  // Medium tier
  "google/gemini-2.5-flash": {
    id: "google/gemini-2.5-flash",
    provider: "google",
    label: "Gemini 2.5 Flash",
    inputCostPer1M: 0.30,
    outputCostPer1M: 2.50,
    maxContext: 1048576,
    maxOutput: 65536,
  },
  "qwen/qwen3-coder": {
    id: "qwen/qwen3-coder",
    provider: "qwen",
    label: "Qwen3 Coder",
    inputCostPer1M: 0.22,
    outputCostPer1M: 1.0,
    maxContext: 262144,
    maxOutput: 65536,
  },
  "anthropic/claude-sonnet-4.6": {
    id: "anthropic/claude-sonnet-4.6",
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    maxContext: 200000,
    maxOutput: 16384,
    nativeProvider: "anthropic",
    nativeModelId: "claude-sonnet-4-6",
  },
  "openai/gpt-4.1": {
    id: "openai/gpt-4.1",
    provider: "openai",
    label: "GPT-4.1",
    inputCostPer1M: 2.0,
    outputCostPer1M: 8.0,
    maxContext: 1048576,
    maxOutput: 32768,
    nativeProvider: "openai",
    nativeModelId: "gpt-4.1",
  },

  // Premium tier
  "anthropic/claude-opus-4.6": {
    id: "anthropic/claude-opus-4.6",
    provider: "anthropic",
    label: "Claude Opus 4.6",
    inputCostPer1M: 5.0,
    outputCostPer1M: 25.0,
    maxContext: 200000,
    maxOutput: 32768,
    nativeProvider: "anthropic",
    nativeModelId: "claude-opus-4-6",
  },
  "openai/o3": {
    id: "openai/o3",
    provider: "openai",
    label: "OpenAI o3",
    inputCostPer1M: 10.0,
    outputCostPer1M: 40.0,
    maxContext: 200000,
    maxOutput: 100000,
    nativeProvider: "openai",
    nativeModelId: "o3",
  },
};

// ---------------------------------------------------------------------------
// Tier cascade definitions
// ---------------------------------------------------------------------------

export const TIER_CASCADE: Record<Tier, TierCascade> = {
  free: {
    primary: MODELS["meta-llama/llama-3.3-70b-instruct:free"]!,
    fallbacks: [
      MODELS["google/gemma-3-27b-it:free"]!,
      MODELS["mistralai/mistral-small-3.1-24b-instruct:free"]!,
    ],
  },
  cheap: {
    primary: MODELS["deepseek/deepseek-chat-v3-0324"]!,
    fallbacks: [
      MODELS["openai/gpt-4.1-mini"]!,
      MODELS["anthropic/claude-haiku-4.5"]!,
      MODELS["meta-llama/llama-3.3-70b-instruct:free"]!, // free as last resort
    ],
  },
  medium: {
    primary: MODELS["google/gemini-2.5-flash"]!, // Best cost/quality ratio
    fallbacks: [
      MODELS["qwen/qwen3-coder"]!,
      MODELS["anthropic/claude-sonnet-4.6"]!,
      MODELS["openai/gpt-4.1"]!,
    ],
  },
  premium: {
    primary: MODELS["anthropic/claude-sonnet-4.6"]!, // Sonnet as default premium (good enough for most)
    fallbacks: [
      MODELS["anthropic/claude-opus-4.6"]!,
      MODELS["openai/o3"]!,
    ],
  },
};

// ---------------------------------------------------------------------------
// Rate limit tracking
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  provider: string;
  cooldownUntil: number; // epoch ms
}

const rateLimitCooldowns: RateLimitEntry[] = [];
const COOLDOWN_MS = 60_000; // 60 seconds

export function markRateLimited(provider: string): void {
  const existing = rateLimitCooldowns.find((e) => e.provider === provider);
  if (existing) {
    existing.cooldownUntil = Date.now() + COOLDOWN_MS;
  } else {
    rateLimitCooldowns.push({ provider, cooldownUntil: Date.now() + COOLDOWN_MS });
  }
}

function isRateLimited(provider: string): boolean {
  const entry = rateLimitCooldowns.find((e) => e.provider === provider);
  if (!entry) return false;
  if (Date.now() >= entry.cooldownUntil) {
    entry.cooldownUntil = 0;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Task complexity classifier
// ---------------------------------------------------------------------------

export type TaskComplexity = "trivial" | "simple" | "moderate" | "complex";

/**
 * Classify task complexity based on the prompt content.
 * Maps complexity to tiers: trivial→free, simple→cheap, moderate→medium, complex→premium
 */
export function classifyTaskComplexity(prompt: string): TaskComplexity {
  const lower = prompt.toLowerCase();
  const wordCount = prompt.split(/\s+/).length;

  // Complex indicators
  const complexPatterns = [
    /architect/i, /design system/i, /refactor/i, /security audit/i,
    /performance optim/i, /migration plan/i, /review.*code/i,
    /debug.*complex/i, /multi.?step/i, /strategy/i, /analysis.*deep/i,
  ];
  if (complexPatterns.some((p) => p.test(lower)) || wordCount > 2000) {
    return "complex";
  }

  // Moderate indicators
  const moderatePatterns = [
    /implement/i, /create.*component/i, /build/i, /write.*function/i,
    /fix.*bug/i, /add.*feature/i, /update.*logic/i, /generate.*html/i,
    /redesign/i, /research/i,
  ];
  if (moderatePatterns.some((p) => p.test(lower)) || wordCount > 500) {
    return "moderate";
  }

  // Simple indicators
  const simplePatterns = [
    /classify/i, /extract/i, /summarize/i, /format/i,
    /translate/i, /list/i, /compare/i,
  ];
  if (simplePatterns.some((p) => p.test(lower)) || wordCount > 100) {
    return "simple";
  }

  return "trivial";
}

export function complexityToTier(complexity: TaskComplexity): Tier {
  switch (complexity) {
    case "trivial": return "free";
    case "simple": return "cheap";
    case "moderate": return "medium";
    case "complex": return "premium";
  }
}

// ---------------------------------------------------------------------------
// Route selection
// ---------------------------------------------------------------------------

export interface RouteResult {
  model: ModelSpec;
  tier: Tier;
  isAutoRouted: boolean;
  attemptIndex: number;
}

/**
 * Get the ordered list of models to try for a given tier,
 * skipping rate-limited providers.
 */
export function getModelsForTier(tier: Tier): ModelSpec[] {
  const cascade = TIER_CASCADE[tier];
  const all = [cascade.primary, ...cascade.fallbacks];
  return all.filter((m) => !isRateLimited(m.provider));
}

/**
 * Resolve a model selector (e.g. "auto", "auto:cheap", "anthropic/claude-sonnet-4-6")
 * to a concrete route.
 */
export function resolveRoute(modelSelector: string, prompt: string): RouteResult {
  // Direct model override
  if (!modelSelector.startsWith("auto")) {
    const model = MODELS[modelSelector];
    if (model) {
      return { model, tier: "medium", isAutoRouted: false, attemptIndex: 0 };
    }
    // Unknown model — try via OpenRouter anyway
    return {
      model: {
        id: modelSelector,
        provider: modelSelector.split("/")[0] ?? "unknown",
        label: modelSelector,
        inputCostPer1M: 0,
        outputCostPer1M: 0,
        maxContext: 128000,
        maxOutput: 8192,
      },
      tier: "medium",
      isAutoRouted: false,
      attemptIndex: 0,
    };
  }

  // Auto:tier — fixed tier
  if (modelSelector.startsWith("auto:")) {
    const tier = modelSelector.split(":")[1] as Tier;
    const models = getModelsForTier(tier);
    return {
      model: models[0] ?? TIER_CASCADE[tier].primary,
      tier,
      isAutoRouted: true,
      attemptIndex: 0,
    };
  }

  // Full auto — classify and route
  const complexity = classifyTaskComplexity(prompt);
  const tier = complexityToTier(complexity);
  const models = getModelsForTier(tier);
  return {
    model: models[0] ?? TIER_CASCADE[tier].primary,
    tier,
    isAutoRouted: true,
    attemptIndex: 0,
  };
}

/**
 * Get the next fallback model after a failure.
 */
export function getNextFallback(tier: Tier, currentAttempt: number): ModelSpec | null {
  const cascade = TIER_CASCADE[tier];
  const all = [cascade.primary, ...cascade.fallbacks];
  // Skip already-attempted positions, then find first non-rate-limited model
  return all.slice(currentAttempt + 1).find((m) => !isRateLimited(m.provider)) ?? null;
}

/**
 * Estimate cost for a given model and token counts.
 */
export function estimateCost(model: ModelSpec, inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * model.inputCostPer1M +
    (outputTokens / 1_000_000) * model.outputCostPer1M
  );
}

export function getModelSpec(modelId: string): ModelSpec | null {
  return MODELS[modelId] ?? null;
}

export function getAllModels(): ModelSpec[] {
  return Object.values(MODELS);
}
