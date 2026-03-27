export const type = "direct_llm";
export const label = "Direct LLM (API routing)";

/**
 * Tier-based model routing with fallback cascade.
 * Each tier has a primary model and fallbacks, ordered by cost-effectiveness.
 *
 * Tiers:
 * - free: Zero-cost models for classification, simple extraction
 * - cheap: Low-cost models for standard tasks ($0.05-0.50/M tokens)
 * - medium: Mid-range models for complex tasks ($0.50-5/M tokens)
 * - premium: Top-tier models for planning, coding, review ($5-15/M tokens)
 */
export const models = [
  // Free tier
  { id: "auto:free", label: "Auto (Free tier)" },
  // Cheap tier
  { id: "auto:cheap", label: "Auto (Cheap tier)" },
  // Medium tier
  { id: "auto:medium", label: "Auto (Medium tier)" },
  // Premium tier
  { id: "auto:premium", label: "Auto (Premium tier)" },
  // Auto: system picks tier based on task complexity
  { id: "auto", label: "Auto (smart routing)" },
  // Direct model overrides via OpenRouter
  { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "anthropic/claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3" },
  { id: "qwen/qwen3-coder", label: "Qwen3 Coder" },
  { id: "openai/gpt-4.1", label: "GPT-4.1" },
  { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini" },
];

export const agentConfigurationDoc = `# direct_llm agent configuration

Adapter: direct_llm

Calls LLM APIs directly via OpenRouter with intelligent tier-based routing.
No CLI spawning — pure API calls with cost optimization.

Core fields:
- model (string): Model or tier selector. Options:
  - "auto" — system picks tier based on task complexity (default)
  - "auto:free" — use free tier models only
  - "auto:cheap" — use cheap tier models
  - "auto:medium" — use medium tier models
  - "auto:premium" — use premium tier models
  - "anthropic/claude-sonnet-4-6" — specific model override
- tier (string, optional): Override tier for all tasks (free|cheap|medium|premium)
- maxTokens (number, optional): Max output tokens (default: 4096)
- temperature (number, optional): Temperature 0-1 (default: 0.7)
- systemPrompt (string, optional): System prompt override
- fallbackEnabled (boolean, optional): Enable cascade fallback on failure (default: true)
- budgetPerRunUsd (number, optional): Max cost per heartbeat run in USD (default: 0.50)
- provider (string, optional): Force specific provider (openrouter|anthropic|openai|google)

Environment variables (set on agent or server):
- OPENROUTER_API_KEY: Required for multi-provider routing
- ANTHROPIC_API_KEY: Optional, for direct Anthropic calls
- OPENAI_API_KEY: Optional, for direct OpenAI calls
- GOOGLE_API_KEY: Optional, for direct Google calls

Cost tiers (approximate per 1M tokens):
- free: $0 (Groq, free OpenRouter models)
- cheap: $0.05-0.50 (Haiku, DeepSeek, Qwen Flash)
- medium: $0.50-5.00 (Sonnet, Gemini Pro, GPT-4.1)
- premium: $5-15 (Opus, GPT-4.1, o3)
`;
