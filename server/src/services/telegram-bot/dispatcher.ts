// S43 — Telegram CEO Bot — dispatcher
//
// Single entry point for every incoming Telegram update. Responsibilities:
//  - enforce allowlist (delegates to auth module)
//  - filter out non-private chats
//  - parse /command arg strings
//  - route to the matching handler
//  - apply command result (sendMessage / editMessageText)
//  - handle callback_query (approval confirm/cancel)
//
// The dispatcher is side-effect heavy but the MECHANICS of parsing and
// routing are pure and fully tested. IO calls (transport, svc) are injected.

import { authenticate, type AllowedChat } from "./auth.js";
import {
  handleApprovalsList,
  handleApprove,
  handleReject,
  executeApprovalDecision,
} from "./commands/approvals.js";
import { handleAgentsList, handleSetCeo } from "./commands/agents.js";
import { handleCompaniesList, handleCompanySelect } from "./commands/companies.js";
import { handleHelp, handleStart } from "./commands/help.js";
import { handleNotify } from "./commands/notify.js";
import { handleIssueDetail, handleIssuesList, handleStatus } from "./commands/status.js";
import { handleTask } from "./commands/task.js";
import { handleWhoami } from "./commands/whoami.js";
import type { BotServices } from "./service-bindings.js";
import type { SessionStore } from "./session-store.js";
import type { TelegramTransport } from "./transport.js";
import type { CommandResult, SessionState, TgUpdate } from "./types.js";

export interface DispatcherLogger {
  debug?: (obj: Record<string, unknown>, msg: string) => void;
  info?: (obj: Record<string, unknown>, msg: string) => void;
  warn?: (obj: Record<string, unknown>, msg: string) => void;
  error?: (obj: Record<string, unknown>, msg: string) => void;
}

export interface DispatcherDeps {
  transport: TelegramTransport;
  store: SessionStore;
  svc: BotServices;
  allowlist: ReadonlyArray<AllowedChat>;
  skipConfirm: boolean;
  logger?: DispatcherLogger;
  /** Optional hook fired after a command result is sent. Used by notifier to subscribe lazily. */
  onSessionChange?: (session: SessionState) => void;
}

/**
 * Parses a raw message.text into `{ command, args }`. A text that doesn't
 * start with "/" returns command = null — that's the free-form /task path.
 * Handles the Telegram "/cmd@botname" suffix.
 */
export function parseCommand(text: string): { command: string | null; args: string } {
  const t = text.trimStart();
  if (!t.startsWith("/")) return { command: null, args: text };
  const spaceIdx = t.search(/\s/);
  const head = spaceIdx === -1 ? t : t.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? "" : t.slice(spaceIdx + 1);
  // strip "@botname" suffix
  const at = head.indexOf("@");
  const command = (at === -1 ? head : head.slice(0, at)).toLowerCase();
  return { command, args };
}

export class Dispatcher {
  constructor(private readonly deps: DispatcherDeps) {}

  async handle(update: TgUpdate): Promise<void> {
    try {
      if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
        return;
      }
      const msg = update.message ?? update.edited_message;
      if (!msg || !msg.text) return;
      if (msg.chat.type !== "private") return; // ignore groups/channels silently

      const auth = authenticate(msg.chat.id, this.deps.allowlist);
      if (!auth.ok) {
        this.deps.logger?.warn?.(
          { chatId: msg.chat.id },
          "telegram bot unauthorized chat",
        );
        await this.deps.transport
          .sendMessage(msg.chat.id, "Chat non autorizzata.")
          .catch(() => void 0);
        return;
      }
      const chatId = String(msg.chat.id);
      const userId = auth.userId!;
      const session = this.deps.store.get(chatId);

      // Upsert closure passed to handlers that mutate session state.
      const upsert = (patch: Partial<Omit<SessionState, "chatId" | "userId">>): SessionState => {
        const next = this.deps.store.upsert(chatId, userId, patch);
        this.deps.onSessionChange?.(next);
        return next;
      };

      const { command, args } = parseCommand(msg.text);
      const result = await this.route(command, args, msg.text, session, chatId, userId, upsert);

      await this.send(msg.chat.id, result);
    } catch (err) {
      this.deps.logger?.error?.(
        { err: (err as Error).message, updateId: update.update_id },
        "telegram dispatcher failed",
      );
    }
  }

  private async route(
    command: string | null,
    args: string,
    fullText: string,
    session: SessionState | undefined,
    chatId: string,
    userId: string,
    upsert: (patch: Partial<Omit<SessionState, "chatId" | "userId">>) => SessionState,
  ): Promise<CommandResult> {
    const svc = this.deps.svc;
    if (command === null) {
      // Free-form → /task
      return handleTask(svc, session, fullText);
    }
    switch (command) {
      case "/start":
        return handleStart(!!session);
      case "/help":
        return handleHelp();
      case "/whoami":
        return handleWhoami(chatId, session);
      case "/companies":
        return handleCompaniesList(svc);
      case "/company":
        return handleCompanySelect(svc, args, chatId, userId, upsert);
      case "/agents":
        return handleAgentsList(svc, session);
      case "/setceo":
        return handleSetCeo(svc, session, args, upsert);
      case "/task":
        return handleTask(svc, session, args);
      case "/status":
        return handleStatus(svc, session);
      case "/issues":
        return handleIssuesList(svc, session);
      case "/issue":
        return handleIssueDetail(svc, session, args);
      case "/approvals":
        return handleApprovalsList(svc, session);
      case "/approve": {
        const res = handleApprove(args, { skipConfirm: this.deps.skipConfirm });
        if (res.pending && session) {
          // skipConfirm path: run it right away
          const exec = await executeApprovalDecision(
            svc,
            userId,
            res.pending.action,
            res.pending.id,
            res.pending.note,
          );
          return exec;
        }
        return res;
      }
      case "/reject": {
        const res = handleReject(args, { skipConfirm: this.deps.skipConfirm });
        if (res.pending && session) {
          const exec = await executeApprovalDecision(
            svc,
            userId,
            res.pending.action,
            res.pending.id,
            res.pending.note,
          );
          return exec;
        }
        return res;
      }
      case "/notify":
        return handleNotify(session, args, upsert);
      default:
        return { text: `Comando sconosciuto: \`${command}\`. /help per la lista.`, parseMode: "Markdown", readonly: true };
    }
  }

  private async send(chatId: number, result: CommandResult): Promise<void> {
    await this.deps.transport.sendMessage(chatId, result.text, {
      parse_mode: result.parseMode,
      reply_markup: result.replyMarkup,
    });
  }

  /**
   * Callback data format: `tgb:<action>:<id>`
   *   action ∈ { approve, reject, cancel }
   */
  async handleCallbackQuery(cb: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
    from: { id: number };
  }): Promise<void> {
    const data = cb.data ?? "";
    if (!data.startsWith("tgb:")) {
      await this.deps.transport.answerCallbackQuery(cb.id).catch(() => void 0);
      return;
    }
    const [, action, id] = data.split(":");
    const msg = cb.message;
    if (!msg) {
      await this.deps.transport.answerCallbackQuery(cb.id).catch(() => void 0);
      return;
    }
    const chatId = msg.chat.id;
    const auth = authenticate(cb.from.id, this.deps.allowlist);
    if (!auth.ok) {
      await this.deps.transport.answerCallbackQuery(cb.id, "Non autorizzato.").catch(() => void 0);
      return;
    }
    if (action === "cancel") {
      await this.deps.transport
        .editMessageText(chatId, msg.message_id, "Annullato.")
        .catch(() => void 0);
      await this.deps.transport.answerCallbackQuery(cb.id).catch(() => void 0);
      return;
    }
    if (action !== "approve" && action !== "reject") {
      await this.deps.transport.answerCallbackQuery(cb.id).catch(() => void 0);
      return;
    }
    // Callback path doesn't carry the original note; we pass null. The
    // note was only visible in the confirmation message — founder can
    // re-issue with skipConfirm if they need notes.
    const result = await executeApprovalDecision(this.deps.svc, auth.userId!, action, id, null);
    await this.deps.transport
      .editMessageText(chatId, msg.message_id, result.text, { parse_mode: "Markdown" })
      .catch(() => void 0);
    await this.deps.transport.answerCallbackQuery(cb.id).catch(() => void 0);
  }
}
