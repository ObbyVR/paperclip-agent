// S43 — Telegram CEO Bot — /notify toggle
import { NOTIFY_KEYS, type CommandResult, type NotifyKey, type SessionState } from "../types.js";

function isNotifyKey(key: string): key is NotifyKey {
  return (NOTIFY_KEYS as string[]).includes(key);
}

export function handleNotify(
  session: SessionState | undefined,
  rawArgs: string,
  upsert: (patch: Partial<SessionState>) => SessionState,
): CommandResult {
  if (!session) {
    return { text: "Configura prima la sessione con /companies.", readonly: true };
  }
  const parts = rawArgs.trim().split(/\s+/);
  if (parts.length !== 2) {
    return {
      text:
        "Uso: `/notify <key> on|off`\n\n" +
        `keys disponibili: ${NOTIFY_KEYS.join(", ")}`,
      parseMode: "Markdown",
      readonly: true,
    };
  }
  const [key, state] = parts;
  if (!isNotifyKey(key)) {
    return {
      text: `Key sconosciuta: \`${key}\`. Disponibili: ${NOTIFY_KEYS.join(", ")}`,
      parseMode: "Markdown",
      readonly: true,
    };
  }
  if (state !== "on" && state !== "off") {
    return { text: "Stato deve essere `on` o `off`.", parseMode: "Markdown", readonly: true };
  }
  const next = { ...session.notifyOn, [key]: state === "on" };
  upsert({ notifyOn: next });
  return {
    text: `🔔 \`${key}\` → *${state}*`,
    parseMode: "Markdown",
  };
}
