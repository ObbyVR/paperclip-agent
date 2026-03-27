export const type = "direct_llm";

export function formatStdoutEvent(line: string, debug: boolean): void {
  try {
    const parsed = JSON.parse(line);
    if (parsed.type === "routing") {
      console.log(`  ↳ Tier: ${parsed.tier} | Model: ${parsed.model} | Complexity: ${parsed.complexity}`);
    } else if (parsed.type === "attempt") {
      console.log(`  ↳ Attempt ${parsed.attempt}: ${parsed.model} (${parsed.provider})`);
    } else if (parsed.type === "fallback") {
      console.log(`  ↳ Fallback: ${parsed.from} → ${parsed.to}`);
    } else if (parsed.type === "result") {
      console.log(`  ↳ Done: ${parsed.model} | ${parsed.inputTokens}+${parsed.outputTokens} tokens | $${parsed.costUsd}`);
    } else if (debug) {
      console.log(`  [debug] ${line}`);
    }
  } catch {
    // Plain text output from the LLM
    if (line.trim()) {
      process.stdout.write(line);
    }
  }
}
