// S43 — Telegram CEO Bot — HTTP transport
//
// Thin wrapper around the Telegram Bot API using only `fetch`. No third-party
// dependencies. The `fetchImpl` constructor param exists so tests can inject a
// mock without touching global fetch.
//
// Only the 5 endpoints the bot actually needs are implemented. Adding more is
// intentionally inconvenient to keep the surface narrow.

import type {
  TgBotCommand,
  TgInlineKeyboardMarkup,
  TgSendMessageOptions,
  TgUpdate,
} from "./types.js";

export type FetchLike = typeof fetch;

export interface TelegramTransportOptions {
  token: string;
  fetchImpl?: FetchLike;
  baseUrl?: string;
}

export class TelegramApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly description: string,
    public readonly method: string,
  ) {
    super(`Telegram API ${method} failed: ${status} ${description}`);
    this.name = "TelegramApiError";
  }
}

/**
 * Thin Telegram Bot API client. Stateless; one instance per bot is fine.
 * All methods throw `TelegramApiError` on a non-ok response so the caller
 * can decide whether to retry, log, or surface to the user.
 */
export class TelegramTransport {
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(opts: TelegramTransportOptions) {
    if (!opts.token || opts.token.trim() === "") {
      throw new Error("TelegramTransport: token is required");
    }
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = opts.baseUrl ?? "https://api.telegram.org";
  }

  private endpoint(method: string): string {
    return `${this.baseUrl}/bot${this.token}/${method}`;
  }

  private async call<T>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    let resp: Response;
    try {
      resp = await this.fetchImpl(this.endpoint(method), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      // Network / abort errors bubble as-is; caller implements retry/backoff.
      throw err;
    }

    let payload: unknown;
    try {
      payload = await resp.json();
    } catch {
      throw new TelegramApiError(resp.status, "invalid JSON response", method);
    }

    const parsed = payload as { ok?: boolean; result?: T; description?: string };
    if (!resp.ok || !parsed.ok) {
      throw new TelegramApiError(resp.status, parsed.description ?? "unknown error", method);
    }
    return parsed.result as T;
  }

  /**
   * Long-poll for updates. Returns an empty array on timeout (not an error).
   * `signal` lets the caller cancel a pending poll on shutdown.
   */
  async getUpdates(
    offset: number,
    timeoutSec: number,
    signal?: AbortSignal,
  ): Promise<TgUpdate[]> {
    return this.call<TgUpdate[]>(
      "getUpdates",
      {
        offset,
        timeout: timeoutSec,
        allowed_updates: ["message", "edited_message", "callback_query"],
      },
      signal,
    );
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    opts?: TgSendMessageOptions,
  ): Promise<void> {
    await this.call<unknown>("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: opts?.parse_mode,
      reply_markup: opts?.reply_markup,
      disable_web_page_preview: opts?.disable_web_page_preview ?? true,
    });
  }

  async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    opts?: { parse_mode?: "Markdown" | "HTML"; reply_markup?: TgInlineKeyboardMarkup },
  ): Promise<void> {
    await this.call<unknown>("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: opts?.parse_mode,
      reply_markup: opts?.reply_markup,
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.call<unknown>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
    });
  }

  async setMyCommands(commands: TgBotCommand[]): Promise<void> {
    await this.call<unknown>("setMyCommands", { commands });
  }

  async getMe(): Promise<{ id: number; username?: string; is_bot: boolean }> {
    return this.call<{ id: number; username?: string; is_bot: boolean }>("getMe", {});
  }
}
