// S43 — Telegram CEO Bot — /approvals, /approve, /reject
//
// Destructive actions (approve / reject) use an inline keyboard confirm step
// unless `skipConfirm` is true (env: PAPERCLIP_TELEGRAM_SKIP_CONFIRM). The
// callback_data carries the intent so the dispatcher can execute it on click
// without re-parsing the original command.

import type { BotServices } from "../service-bindings.js";
import type { CommandResult, SessionState, TgInlineKeyboardMarkup } from "../types.js";

function requireCompany(session: SessionState | undefined): CommandResult | null {
  if (session?.companyId) return null;
  return {
    text: "Seleziona prima una company con `/company <id>`.",
    parseMode: "Markdown",
    readonly: true,
  };
}

export async function handleApprovalsList(
  svc: BotServices,
  session: SessionState | undefined,
): Promise<CommandResult> {
  const guard = requireCompany(session);
  if (guard) return guard;
  const approvals = await svc.listPendingApprovals(session!.companyId!);
  if (approvals.length === 0) {
    return { text: "Nessuna approval pending. ✅", readonly: true };
  }
  const lines = approvals.map((a) => {
    const name =
      (a.payload as { name?: unknown }).name &&
      typeof (a.payload as { name?: unknown }).name === "string"
        ? ` — *${(a.payload as { name: string }).name}*`
        : "";
    return `• \`${a.id}\` · ${a.type}${name}`;
  });
  return {
    text:
      `*Approvals pending (${approvals.length}):*\n${lines.join("\n")}\n\n` +
      `\`/approve <id> [nota]\` · \`/reject <id> <motivo>\``,
    parseMode: "Markdown",
    readonly: true,
  };
}

/**
 * Parses "<id> <rest-of-the-line>". Both fields are trimmed. A missing rest
 * returns null for `note`.
 */
export function parseIdAndNote(raw: string): { id: string; note: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { id: "", note: null };
  const spaceIdx = trimmed.search(/\s/);
  if (spaceIdx === -1) return { id: trimmed, note: null };
  const id = trimmed.slice(0, spaceIdx).trim();
  const note = trimmed.slice(spaceIdx + 1).trim();
  return { id, note: note === "" ? null : note };
}

function confirmKeyboard(action: "approve" | "reject", id: string): TgInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Conferma", callback_data: `tgb:${action}:${id}` },
        { text: "❌ Annulla", callback_data: `tgb:cancel:${id}` },
      ],
    ],
  };
}

export function handleApprove(
  rawArgs: string,
  opts: { skipConfirm: boolean },
): CommandResult & { pending?: { action: "approve"; id: string; note: string | null } } {
  const { id, note } = parseIdAndNote(rawArgs);
  if (!id) {
    return { text: "Uso: `/approve <id> [nota]`", parseMode: "Markdown", readonly: true };
  }
  if (opts.skipConfirm) {
    return {
      text: `Confermato inline — eseguo approve \`${id}\`…`,
      parseMode: "Markdown",
      readonly: true,
      pending: { action: "approve", id, note },
    };
  }
  return {
    text: `Confermi *approve* di \`${id}\`?${note ? `\nnota: _${note}_` : ""}`,
    parseMode: "Markdown",
    replyMarkup: confirmKeyboard("approve", id),
    readonly: true,
  };
}

export function handleReject(
  rawArgs: string,
  opts: { skipConfirm: boolean },
): CommandResult & { pending?: { action: "reject"; id: string; note: string } } {
  const { id, note } = parseIdAndNote(rawArgs);
  if (!id) {
    return { text: "Uso: `/reject <id> <motivo>`", parseMode: "Markdown", readonly: true };
  }
  if (!note) {
    return {
      text: "Il reject richiede un motivo: `/reject <id> <motivo>`",
      parseMode: "Markdown",
      readonly: true,
    };
  }
  if (opts.skipConfirm) {
    return {
      text: `Confermato inline — eseguo reject \`${id}\`…`,
      parseMode: "Markdown",
      readonly: true,
      pending: { action: "reject", id, note },
    };
  }
  return {
    text: `Confermi *reject* di \`${id}\`?\nmotivo: _${note}_`,
    parseMode: "Markdown",
    replyMarkup: confirmKeyboard("reject", id),
    readonly: true,
  };
}

/**
 * Actually executes an approve/reject against the services. Used both by the
 * skipConfirm path (called immediately after the command) and by the callback
 * query handler (called after the user taps "Conferma").
 */
export async function executeApprovalDecision(
  svc: BotServices,
  userId: string,
  action: "approve" | "reject",
  id: string,
  note: string | null,
): Promise<CommandResult> {
  try {
    if (action === "approve") {
      const a = await svc.approveApproval(id, userId, note);
      return { text: `✅ Approval \`${a.id}\` ${a.status}.`, parseMode: "Markdown" };
    }
    // reject requires a note by MVP rule; the caller validates, so a null
    // here would be a programmer error — we still fall back to "rejected by
    // telegram bot" to avoid a runtime crash in an edge we didn't anticipate.
    const a = await svc.rejectApproval(id, userId, note ?? "rejected via telegram bot");
    return { text: `🚫 Approval \`${a.id}\` ${a.status}.`, parseMode: "Markdown" };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return { text: `❌ Errore: ${msg}`, readonly: true };
  }
}
