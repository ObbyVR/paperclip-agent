// S43 — Telegram CEO Bot — /whoami debug command
import type { CommandResult, SessionState } from "../types.js";

export function handleWhoami(chatId: string, session: SessionState | undefined): CommandResult {
  if (!session) {
    return {
      text:
        `chat_id: \`${chatId}\`\n` +
        `session: *nessuna*\n\n` +
        `Sei nell'allowlist ma non hai ancora configurato nulla. Usa /companies per iniziare.`,
      parseMode: "Markdown",
      readonly: true,
    };
  }
  const notify = Object.entries(session.notifyOn)
    .map(([k, v]) => `  ${v ? "✅" : "❌"} ${k}`)
    .join("\n");
  return {
    text:
      `chat_id: \`${session.chatId}\`\n` +
      `userId: \`${session.userId}\`\n` +
      `companyId: \`${session.companyId ?? "—"}\`\n` +
      `ceoAgentId: \`${session.ceoAgentId ?? "—"}\`\n` +
      `updatedAt: ${session.updatedAt}\n\n` +
      `notifiche:\n${notify}`,
    parseMode: "Markdown",
    readonly: true,
  };
}
