/**
 * AI intelligence tier presets for the UI.
 * Core config (tier -> model+effort) comes from @paperclipai/shared.
 * This file adds UI-specific metadata (labels, icons, descriptions).
 */

import {
  AI_TIER_KEYS,
  tierToAdapterConfig,
  type AiTierKey as SharedAiTierKey,
  type AiTierAdapterConfig,
} from "@paperclipai/shared";

export type AiTierKey = SharedAiTierKey | "custom";

export interface AiTierConfig {
  model: string;
  effort: string;
}

export interface AiTierDef {
  key: AiTierKey;
  label: string;
  icon: string;
  description: string;
  costLabel: string;
  config: AiTierConfig | null; // null for "custom"
}

export const AI_TIERS: AiTierDef[] = [
  {
    key: "estremo",
    label: "Estremo",
    icon: "⚡",
    description: "Opus 4.6 · massima qualità",
    costLabel: "$$$$$",
    config: tierToAdapterConfig("estremo"),
  },
  {
    key: "alto",
    label: "Alto",
    icon: "🔥",
    description: "Sonnet 4.6 · ragionamento profondo",
    costLabel: "$$$",
    config: tierToAdapterConfig("alto"),
  },
  {
    key: "bilanciato",
    label: "Bilanciato",
    icon: "⚖️",
    description: "Sonnet 4.6 · equilibrio qualità/costo",
    costLabel: "$$",
    config: tierToAdapterConfig("bilanciato"),
  },
  {
    key: "basso",
    label: "Economia",
    icon: "💰",
    description: "Haiku 4.5 · veloce e economico",
    costLabel: "$",
    config: tierToAdapterConfig("basso"),
  },
  {
    key: "custom",
    label: "Custom",
    icon: "🔧",
    description: "Scegli modello e effort manualmente",
    costLabel: "",
    config: null,
  },
];

const STORAGE_KEY = "paperclip:global-ai-tier";

export function getGlobalAiTier(): AiTierKey {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val && AI_TIERS.some((t) => t.key === val)) return val as AiTierKey;
  } catch { /* noop */ }
  return "bilanciato";
}

export function setGlobalAiTier(tier: AiTierKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, tier);
  } catch { /* noop */ }
}

export function getTierDef(key: AiTierKey): AiTierDef {
  return AI_TIERS.find((t) => t.key === key) ?? AI_TIERS[2]; // fallback to bilanciato
}

export function tierToAdapterOverrides(tier: AiTierKey): { model: string; effort: string } | null {
  const def = getTierDef(tier);
  return def.config ?? null;
}
