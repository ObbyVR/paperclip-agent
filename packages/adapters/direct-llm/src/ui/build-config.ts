import type { CreateConfigValues } from "@paperclipai/adapter-utils";

function parseEnvVars(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    env[key] = value;
  }
  return env;
}

export function buildDirectLlmConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};

  if (v.model) ac.model = v.model;
  if (v.promptTemplate) ac.promptTemplate = v.promptTemplate;
  if (v.maxTurnsPerRun) ac.maxTokens = v.maxTurnsPerRun; // Reuse field for maxTokens

  // Parse env vars for API keys
  const env = parseEnvVars(v.envVars);
  if (Object.keys(env).length > 0) ac.env = env;

  // Defaults
  ac.temperature = 0.7;
  ac.fallbackEnabled = true;
  ac.budgetPerRunUsd = 0.50;
  ac.timeoutSec = 120;

  return ac;
}
