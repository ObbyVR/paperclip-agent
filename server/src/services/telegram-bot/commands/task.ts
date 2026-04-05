// S43 — Telegram CEO Bot — /task + free-form handler
//
// A free-form text message in a private chat by an allowlisted user is
// treated as a /task. The first line becomes the issue title (truncated to
// MAX_TITLE_LEN with a trailing ellipsis); the remainder — plus any trailing
// content past the title truncation — becomes the description.
//
// Issues are created with status "open" and an assigneeAgentId. We don't use
// "in_progress" because (a) the paperclip issue-assignment wake-up service
// already triggers the agent on assignment, and (b) "open" is safer if the
// agent is already mid-run on another task — the normal queue handles it.

import type { BotServices } from "../service-bindings.js";
import type { CommandResult, SessionState } from "../types.js";

export const MAX_TITLE_LEN = 120;

/** Pure helper exposed for unit tests. */
export function splitTitleAndDescription(text: string): { title: string; description: string | null } {
  const trimmed = text.trim();
  if (trimmed === "") return { title: "", description: null };
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline === -1) {
    if (trimmed.length <= MAX_TITLE_LEN) {
      return { title: trimmed, description: null };
    }
    // Single long line: truncate title, keep full text in description.
    return {
      title: trimmed.slice(0, MAX_TITLE_LEN - 1) + "…",
      description: trimmed,
    };
  }
  const firstLine = trimmed.slice(0, firstNewline).trim();
  const rest = trimmed.slice(firstNewline + 1).trim();
  if (firstLine.length <= MAX_TITLE_LEN) {
    return { title: firstLine, description: rest === "" ? null : rest };
  }
  // First line too long — truncate title, keep the entire original text as
  // description so no content is lost.
  return {
    title: firstLine.slice(0, MAX_TITLE_LEN - 1) + "…",
    description: trimmed,
  };
}

export async function handleTask(
  svc: BotServices,
  session: SessionState | undefined,
  rawText: string,
  userId: string,
): Promise<CommandResult> {
  if (!session?.companyId) {
    return {
      text: "Seleziona prima una company con `/company <id>`.",
      parseMode: "Markdown",
      readonly: true,
    };
  }
  if (!session.ceoAgentId) {
    return {
      text: "Nessun CEO designato. Usa `/agents` e poi `/setceo <agentId>`.",
      parseMode: "Markdown",
      readonly: true,
    };
  }
  const { title, description } = splitTitleAndDescription(rawText);
  if (title === "") {
    return { text: "Il task è vuoto — scrivi almeno un titolo.", readonly: true };
  }

  try {
    const issue = await svc.createIssue({
      companyId: session.companyId,
      title,
      description,
      assigneeAgentId: session.ceoAgentId,
      createdByUserId: userId,
    });
    return {
      text:
        `✅ Task creato: *${issue.identifier}*\n` +
        `_${issue.title}_\n\n` +
        `L'agente verrà svegliato dal sistema di assignment.`,
      parseMode: "Markdown",
    };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return { text: `❌ Errore nella creazione del task: ${msg}`, readonly: true };
  }
}
