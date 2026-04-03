/**
 * Shared AI intelligence tier definitions.
 * Maps tier keys to model + thinking effort for claude_local adapter.
 *
 * Used by:
 * - UI (BreadcrumbBar tier selector, NewIssueDialog)
 * - Server (heartbeat global tier fallback)
 */

export const AI_TIER_KEYS = ["estremo", "alto", "bilanciato", "basso"] as const;
export type AiTierKey = (typeof AI_TIER_KEYS)[number];

export interface AiTierAdapterConfig {
  model: string;
  effort: string;
}

const TIER_CONFIGS: Record<AiTierKey, AiTierAdapterConfig> = {
  estremo:    { model: "claude-opus-4-6",   effort: "high" },
  alto:       { model: "claude-sonnet-4-6", effort: "high" },
  bilanciato: { model: "claude-sonnet-4-6", effort: "medium" },
  basso:      { model: "claude-haiku-4-5",  effort: "" },
};

/**
 * Resolve a tier key to adapter config overrides (model + effort).
 * Returns null for unknown keys.
 */
export function tierToAdapterConfig(key: string): AiTierAdapterConfig | null {
  return TIER_CONFIGS[key as AiTierKey] ?? null;
}

/** Check if a string is a valid tier key. */
export function isValidAiTierKey(key: unknown): key is AiTierKey {
  return typeof key === "string" && AI_TIER_KEYS.includes(key as AiTierKey);
}
