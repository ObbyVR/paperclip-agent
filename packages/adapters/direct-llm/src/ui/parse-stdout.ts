import type { TranscriptEntry } from "@paperclipai/adapter-utils";

export function parseDirectLlmStdoutLine(line: string, ts: string): TranscriptEntry[] {
  try {
    const parsed = JSON.parse(line);

    if (parsed.type === "routing") {
      return [{
        kind: "system",
        ts,
        text: `Routing: tier=${parsed.tier} model=${parsed.model} complexity=${parsed.complexity}${parsed.isAutoRouted ? " (auto)" : ""}`,
      }];
    }

    if (parsed.type === "attempt") {
      return [{
        kind: "system",
        ts,
        text: `Attempt ${parsed.attempt}: ${parsed.model} (${parsed.provider})`,
      }];
    }

    if (parsed.type === "fallback") {
      return [{
        kind: "system",
        ts,
        text: `Fallback: ${parsed.from} → ${parsed.to} (${parsed.reason})`,
      }];
    }

    if (parsed.type === "result") {
      return [{
        kind: "result",
        ts,
        text: `${parsed.model} | ${parsed.inputTokens}+${parsed.outputTokens} tokens | $${parsed.costUsd}`,
        inputTokens: parsed.inputTokens,
        outputTokens: parsed.outputTokens,
        cachedTokens: 0,
        costUsd: parsed.costUsd,
        subtype: "direct_llm",
        isError: false,
        errors: [],
      }];
    }

    // Unknown JSON
    return [{ kind: "stdout", ts, text: line }];
  } catch {
    // Plain text — this is the actual LLM output
    if (line.trim()) {
      return [{ kind: "assistant", ts, text: line }];
    }
    return [];
  }
}
