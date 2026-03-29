/**
 * Static Anthropic API pricing table for subscription-based cost estimation.
 * Prices in USD per 1M tokens. Update EUR_PER_USD periodically.
 *
 * Source: https://www.anthropic.com/pricing — last updated 2026-03
 */

export const EUR_PER_USD = 0.92;

type ModelPrice = {
  inputPerM: number;   // USD per 1M input tokens
  outputPerM: number;  // USD per 1M output tokens
  cachedPerM: number;  // USD per 1M cached (cache-read) tokens
};

const MODEL_PRICES: Record<string, ModelPrice> = {
  // Claude 4.x
  "claude-opus-4-6":              { inputPerM: 15,   outputPerM: 75,  cachedPerM: 1.5  },
  "claude-opus-4-5":              { inputPerM: 15,   outputPerM: 75,  cachedPerM: 1.5  },
  "claude-sonnet-4-6":            { inputPerM: 3,    outputPerM: 15,  cachedPerM: 0.3  },
  "claude-sonnet-4-5":            { inputPerM: 3,    outputPerM: 15,  cachedPerM: 0.3  },
  "claude-haiku-4-5":             { inputPerM: 0.8,  outputPerM: 4,   cachedPerM: 0.08 },
  "claude-haiku-4-5-20251001":    { inputPerM: 0.8,  outputPerM: 4,   cachedPerM: 0.08 },
  // Claude 3.x legacy
  "claude-3-5-sonnet-20241022":   { inputPerM: 3,    outputPerM: 15,  cachedPerM: 0.3  },
  "claude-3-5-sonnet-20240620":   { inputPerM: 3,    outputPerM: 15,  cachedPerM: 0.3  },
  "claude-3-5-haiku-20241022":    { inputPerM: 0.8,  outputPerM: 4,   cachedPerM: 0.08 },
  "claude-3-opus-20240229":       { inputPerM: 15,   outputPerM: 75,  cachedPerM: 1.5  },
  "claude-3-sonnet-20240229":     { inputPerM: 3,    outputPerM: 15,  cachedPerM: 0.3  },
  "claude-3-haiku-20240307":      { inputPerM: 0.25, outputPerM: 1.25,cachedPerM: 0.03 },
};

/** Normalize model ID for table lookup (case-insensitive, prefix match). */
function resolvePrice(model: string): ModelPrice | null {
  const m = model.toLowerCase().trim();
  if (MODEL_PRICES[m]) return MODEL_PRICES[m];
  // Prefix match: e.g. "claude-sonnet-4-6-20260101" → "claude-sonnet-4-6"
  for (const [key, price] of Object.entries(MODEL_PRICES)) {
    if (m.startsWith(key)) return price;
  }
  // Reverse prefix: key contains the model substring
  for (const [key, price] of Object.entries(MODEL_PRICES)) {
    if (key.startsWith(m)) return price;
  }
  return null;
}

/**
 * Estimates API cost in USD for a single run.
 * Returns null if the model is not in the pricing table.
 */
export function estimateRunCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
): number | null {
  const price = resolvePrice(model);
  if (!price) return null;
  return (
    inputTokens  * price.inputPerM  / 1_000_000 +
    outputTokens * price.outputPerM / 1_000_000 +
    cachedTokens * price.cachedPerM / 1_000_000
  );
}

/**
 * Estimates API cost in EUR for a single run.
 * Returns null if the model is not in the pricing table.
 */
export function estimateRunCostEur(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
): number | null {
  const usd = estimateRunCostUsd(model, inputTokens, outputTokens, cachedTokens);
  return usd === null ? null : usd * EUR_PER_USD;
}

/**
 * Formats a EUR value with Italian locale (comma as decimal separator).
 * < €0.01 → 4 decimal places; otherwise → 2 decimal places.
 */
export function formatEur(value: number): string {
  const decimals = value < 0.01 ? 4 : 2;
  return `€${value.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Returns a short human-readable model label (e.g. "Sonnet 4.6"). */
export function modelLabel(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("opus-4"))    return "Opus 4";
  if (m.includes("sonnet-4-6")) return "Sonnet 4.6";
  if (m.includes("sonnet-4-5")) return "Sonnet 4.5";
  if (m.includes("sonnet-4"))   return "Sonnet 4";
  if (m.includes("haiku-4-5"))  return "Haiku 4.5";
  if (m.includes("haiku-4"))    return "Haiku 4";
  if (m.includes("opus-3"))     return "Opus 3";
  if (m.includes("sonnet-3-5")) return "Sonnet 3.5";
  if (m.includes("sonnet-3"))   return "Sonnet 3";
  if (m.includes("haiku-3"))    return "Haiku 3";
  // fallback: strip date suffix like -20241022
  return model.replace(/-\d{8}$/, "").replace(/^claude-/, "");
}
