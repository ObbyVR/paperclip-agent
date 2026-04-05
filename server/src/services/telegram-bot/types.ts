// S43 — Telegram CEO Bot
//
// Types for the Telegram bot module. These are the minimum subset of the
// Telegram Bot API shapes we care about, kept intentionally narrow so we can
// mock them in tests without pulling in a third-party dependency.
//
// Only types — no runtime code. This file is safe to import anywhere.

export type TgChatType = "private" | "group" | "supergroup" | "channel";

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TgChat {
  id: number;
  type: TgChatType;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface TgInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TgInlineKeyboardMarkup {
  inline_keyboard: TgInlineKeyboardButton[][];
}

export interface TgSendMessageOptions {
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
  reply_markup?: TgInlineKeyboardMarkup;
  disable_web_page_preview?: boolean;
}

export interface TgBotCommand {
  command: string;
  description: string;
}

/** Per-chat persisted session state. Everything optional except chatId/userId. */
export interface SessionState {
  chatId: string;
  userId: string;
  companyId: string | null;
  ceoAgentId: string | null;
  notifyOn: {
    approvalsPending: boolean;
    runFailed: boolean;
    issueErrored: boolean;
    agentHired: boolean;
    // S43-2: agent responded (comment or completion) on a bot-created issue
    agentReplied: boolean;
    // S43-3: approval resolved by someone else (approved/rejected/revision)
    approvalResolved: boolean;
    // S43-3: budget threshold crossed (soft/hard) or incident resolved
    budgetAlert: boolean;
    // S43-3: agent lifecycle events (paused, terminated)
    agentLifecycle: boolean;
    // S43-3: issue suspension expired (reminder task is back)
    issueUnsuspended: boolean;
    // S43-3: hire hook failure (agent hire pipeline error)
    hireFailed: boolean;
  };
  /**
   * S43-2: the set of issue UUIDs this chat created via the bot. Used by the
   * notifier to filter incoming issue.comment_added / issue.updated events
   * to only those the founder actually cares about (i.e. their own tasks).
   * Bounded at OWNED_ISSUES_MAX to avoid unbounded growth; older entries are
   * dropped FIFO when the limit is reached.
   */
  ownedIssueIds: string[];
  /**
   * S43-3: enable the digest composer for this chat. When true, agent
   * comments + terminal status changes are batched per-issue and sent as a
   * single summary message instead of one push per event. Toggled via
   * `/digest on|off`. Default: true.
   */
  digestEnabled: boolean;
  updatedAt: string;
}

export type NotifyKey = keyof SessionState["notifyOn"];

export const NOTIFY_KEYS: NotifyKey[] = [
  "approvalsPending",
  "runFailed",
  "issueErrored",
  "agentHired",
  "agentReplied",
  "approvalResolved",
  "budgetAlert",
  "agentLifecycle",
  "issueUnsuspended",
  "hireFailed",
];

/** Maximum number of issue UUIDs tracked per session. */
export const OWNED_ISSUES_MAX = 200;

/** Result object returned by command handlers. */
export interface CommandResult {
  text: string;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
  replyMarkup?: TgInlineKeyboardMarkup;
  /** If true, dispatcher should not persist any session changes made by the handler. */
  readonly?: boolean;
}

/** Default notification prefs for a brand-new session. */
export function defaultNotifyOn(): SessionState["notifyOn"] {
  return {
    approvalsPending: true,
    runFailed: true,
    issueErrored: true,
    agentHired: true,
    agentReplied: true,
    approvalResolved: true,
    budgetAlert: true,
    agentLifecycle: true,
    issueUnsuspended: true,
    hireFailed: true,
  };
}
