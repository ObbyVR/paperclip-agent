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
  };
  updatedAt: string;
}

export type NotifyKey = keyof SessionState["notifyOn"];

export const NOTIFY_KEYS: NotifyKey[] = [
  "approvalsPending",
  "runFailed",
  "issueErrored",
  "agentHired",
];

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
  };
}
