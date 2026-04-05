// S43 — Telegram CEO Bot — auth / allowlist
//
// chat_id → paperclip userId mapping comes from a single env var:
//   PAPERCLIP_TELEGRAM_ALLOWED_CHAT_IDS="12345:uuid,67890:uuid"
//
// Parsing is defensive: whitespace trimmed, empty entries dropped, malformed
// entries skipped with a warning. An empty allowlist with the bot enabled is
// legal but the bot will reply "unauthorized" to everyone — this is a
// deliberate choice so a misconfigured deploy fails closed, not open.

export interface AllowedChat {
  chatId: string;
  userId: string;
}

export interface AuthResult {
  ok: boolean;
  userId?: string;
}

/**
 * Parse the raw env var value into a normalized allowlist.
 * Returns a tuple `[entries, warnings]`. Warnings are human-readable strings
 * the caller can log at startup.
 */
export function parseAllowedChatIds(raw: string | undefined | null): {
  entries: AllowedChat[];
  warnings: string[];
} {
  const warnings: string[] = [];
  if (!raw || raw.trim() === "") {
    return { entries: [], warnings };
  }

  const entries: AllowedChat[] = [];
  const seenChatIds = new Set<string>();

  for (const rawEntry of raw.split(",")) {
    const entry = rawEntry.trim();
    if (entry === "") continue;

    const colonIdx = entry.indexOf(":");
    if (colonIdx < 1 || colonIdx === entry.length - 1) {
      warnings.push(`malformed allowlist entry (expected 'chatId:userId'): ${entry}`);
      continue;
    }

    const chatId = entry.slice(0, colonIdx).trim();
    const userId = entry.slice(colonIdx + 1).trim();

    if (!/^-?\d+$/.test(chatId)) {
      warnings.push(`invalid chat_id (must be integer): ${chatId}`);
      continue;
    }
    if (userId === "") {
      warnings.push(`empty userId for chat_id ${chatId}`);
      continue;
    }
    if (seenChatIds.has(chatId)) {
      warnings.push(`duplicate chat_id in allowlist: ${chatId}`);
      continue;
    }

    seenChatIds.add(chatId);
    entries.push({ chatId, userId });
  }

  return { entries, warnings };
}

/**
 * Look up a chat_id in an already-parsed allowlist.
 * Accepts either `number` (as received from Telegram) or `string`.
 */
export function authenticate(
  chatId: number | string,
  allowlist: ReadonlyArray<AllowedChat>,
): AuthResult {
  const key = typeof chatId === "number" ? String(chatId) : chatId.trim();
  const hit = allowlist.find((e) => e.chatId === key);
  if (!hit) return { ok: false };
  return { ok: true, userId: hit.userId };
}
