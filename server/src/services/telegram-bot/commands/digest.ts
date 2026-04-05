// S43-3 — Telegram CEO Bot — /digest on|off
//
// Toggles the per-session "digest" mode. When enabled, agent comments and
// terminal status changes on bot-created issues are batched per-issue into
// a single summary message instead of one push per event.
import type { CommandResult, SessionState } from "../types.js";

export function handleDigest(
  session: SessionState | undefined,
  rawArgs: string,
  upsert: (patch: Partial<SessionState>) => SessionState,
): CommandResult {
  if (!session) {
    return { text: "Configura prima la sessione con /companies.", readonly: true };
  }
  const arg = rawArgs.trim().toLowerCase();
  if (arg === "") {
    return {
      text:
        `Digest: *${session.digestEnabled ? "on" : "off"}*\n\n` +
        `Quando è on, i commenti dell'agente sullo stesso task vengono ` +
        `raggruppati in un unico messaggio di riepilogo (finestra: 90s).\n\n` +
        `Uso: \`/digest on\` o \`/digest off\``,
      parseMode: "Markdown",
      readonly: true,
    };
  }
  if (arg !== "on" && arg !== "off") {
    return { text: "Uso: `/digest on` o `/digest off`", parseMode: "Markdown", readonly: true };
  }
  upsert({ digestEnabled: arg === "on" });
  return {
    text:
      arg === "on"
        ? "📦 Digest *attivato*. I commenti dell'agente verranno raggruppati in un unico messaggio per task."
        : "📤 Digest *disattivato*. Ogni commento/chiusura arriverà come notifica separata.",
    parseMode: "Markdown",
  };
}
