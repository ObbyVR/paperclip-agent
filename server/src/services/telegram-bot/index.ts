// S43 — Telegram CEO Bot — entry point
//
// `startTelegramBot(opts)` is the ONE thing `server/src/index.ts` imports. It
// is called inside a `void ... .catch(logger.error)` gate so any failure
// (missing token, bad allowlist, network error, bug) is fully isolated from
// the rest of the server boot.
//
// The long-polling loop runs in the background and stops on SIGTERM via an
// AbortController. Call the returned `stop()` to tear down mid-life.

import path from "node:path";
import type { Db } from "@paperclipai/db";
import { parseAllowedChatIds, type AllowedChat } from "./auth.js";
import { Dispatcher } from "./dispatcher.js";
import { Notifier } from "./notifier.js";
import { SessionStore } from "./session-store.js";
import { TelegramTransport } from "./transport.js";
import type { BotServices } from "./service-bindings.js";

export interface StartTelegramBotOptions {
  token: string;
  allowedChatIdsRaw: string;
  skipConfirm: boolean;
  sessionsFilePath: string;
  services: BotServices;
  /** Injected from paperclip's live-events module in the real wiring. */
  subscribeCompanyLiveEvents: (
    companyId: string,
    listener: (event: { type: string; companyId?: string; payload?: Record<string, unknown> }) => void,
  ) => () => void;
  logger: {
    debug?: (obj: Record<string, unknown>, msg: string) => void;
    info: (obj: Record<string, unknown>, msg: string) => void;
    warn: (obj: Record<string, unknown>, msg: string) => void;
    error: (obj: Record<string, unknown>, msg: string) => void;
  };
}

export interface TelegramBotHandle {
  stop: () => Promise<void>;
}

const POLL_TIMEOUT_SEC = 25;
const ERROR_BACKOFF_MS = 5000;

export async function startTelegramBot(opts: StartTelegramBotOptions): Promise<TelegramBotHandle> {
  const { entries: allowlist, warnings } = parseAllowedChatIds(opts.allowedChatIdsRaw);
  for (const w of warnings) {
    opts.logger.warn({ w }, "telegram bot allowlist warning");
  }
  if (allowlist.length === 0) {
    opts.logger.warn(
      {},
      "telegram bot allowlist is empty — bot will reject every chat",
    );
  }

  const transport = new TelegramTransport({ token: opts.token });
  const store = new SessionStore({
    filePath: opts.sessionsFilePath,
    logger: opts.logger,
  });
  await store.load();

  const notifier = new Notifier({
    transport,
    store,
    subscribeCompanyLiveEvents: opts.subscribeCompanyLiveEvents,
    logger: opts.logger,
  });
  notifier.start();

  const dispatcher = new Dispatcher({
    transport,
    store,
    svc: opts.services,
    allowlist,
    skipConfirm: opts.skipConfirm,
    logger: opts.logger,
    onSessionChange: (session) => notifier.subscribeSession(session),
  });

  // Best-effort: register the slash-command list with Telegram so users get
  // auto-complete. Any failure is logged and ignored — not critical.
  await transport
    .setMyCommands([
      { command: "start", description: "Benvenuto / setup" },
      { command: "help", description: "Lista comandi" },
      { command: "companies", description: "Lista company" },
      { command: "company", description: "Seleziona company" },
      { command: "agents", description: "Lista agenti" },
      { command: "setceo", description: "Designa CEO" },
      { command: "task", description: "Crea task per il CEO" },
      { command: "status", description: "Dashboard summary" },
      { command: "issues", description: "Issue attive" },
      { command: "issue", description: "Dettaglio issue" },
      { command: "approvals", description: "Approvals pending" },
      { command: "approve", description: "Approva approval" },
      { command: "reject", description: "Rifiuta approval" },
      { command: "notify", description: "Toggle notifiche" },
      { command: "digest", description: "Raggruppa risposte agente" },
      { command: "whoami", description: "Sessione corrente" },
    ])
    .catch((err) => {
      opts.logger.warn({ err: (err as Error).message }, "telegram setMyCommands failed");
    });

  // Best-effort getMe to log which bot we just connected to.
  try {
    const me = await transport.getMe();
    opts.logger.info(
      { botId: me.id, botUsername: me.username, allowlistSize: allowlist.length },
      "telegram bot connected",
    );
  } catch (err) {
    opts.logger.error(
      { err: (err as Error).message },
      "telegram bot getMe failed — likely invalid token",
    );
  }

  const abort = new AbortController();
  let stopped = false;

  // Long polling loop — runs detached from startServer.
  void (async () => {
    let offset = 0;
    while (!stopped) {
      try {
        const updates = await transport.getUpdates(offset, POLL_TIMEOUT_SEC, abort.signal);
        for (const u of updates) {
          offset = u.update_id + 1;
          void dispatcher.handle(u).catch((err) => {
            opts.logger.error(
              { err: (err as Error).message, updateId: u.update_id },
              "telegram dispatcher unhandled error",
            );
          });
        }
      } catch (err) {
        if (stopped) break;
        const name = (err as { name?: string }).name;
        if (name === "AbortError") break;
        opts.logger.error(
          { err: (err as Error).message },
          `telegram poll failed, backoff ${ERROR_BACKOFF_MS}ms`,
        );
        await sleep(ERROR_BACKOFF_MS, abort.signal).catch(() => void 0);
      }
    }
  })();

  return {
    stop: async () => {
      stopped = true;
      abort.abort();
      notifier.flushDigests();
      notifier.stop();
      await store.flush().catch(() => void 0);
      store.cancel();
      opts.logger.info({}, "telegram bot stopped");
    },
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/** Default location for the sessions JSON file. */
export function defaultSessionsFilePath(homeRoot: string): string {
  return path.join(homeRoot, "telegram-bot-sessions.json");
}

export type { BotServices, AllowedChat };
