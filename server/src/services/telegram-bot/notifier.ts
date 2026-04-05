// S43 — Telegram CEO Bot — notifier (live-events → Telegram bridge)
//
// For every session that has a selected companyId, we subscribe to the
// paperclip live-events bus and forward interesting events to Telegram.
// Notifications respect per-session `notifyOn` prefs and are rate-limited
// per chat_id + kind (10 s dedup by default) to avoid burst spam.
//
// The live-events bus is injected (not imported) so tests can provide a
// trivial fake without pulling the real singleton.

import type { SessionStore } from "./session-store.js";
import type { TelegramTransport } from "./transport.js";
import type { NotifyKey, SessionState } from "./types.js";

export interface LiveEventLike {
  type: string;
  companyId?: string;
  payload?: Record<string, unknown>;
  at?: string;
}

/**
 * Minimal interface the notifier needs from paperclip's live-events module.
 * Matches the signature of `subscribeCompanyLiveEvents` from services/live-events.ts.
 */
export type SubscribeCompanyLiveEvents = (
  companyId: string,
  listener: (event: LiveEventLike) => void,
) => () => void;

export interface NotifierOptions {
  transport: TelegramTransport;
  store: SessionStore;
  subscribeCompanyLiveEvents: SubscribeCompanyLiveEvents;
  dedupWindowMs?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  logger?: {
    debug?: (obj: Record<string, unknown>, msg: string) => void;
    warn?: (obj: Record<string, unknown>, msg: string) => void;
    error?: (obj: Record<string, unknown>, msg: string) => void;
  };
}

const DEFAULT_DEDUP_MS = 10_000;

type EventMapping = {
  key: NotifyKey;
  render: (event: LiveEventLike) => string;
};

/**
 * Classify a live event into a notify key + rendered message. Returns null
 * if the event is not one we want to forward. Exposed for unit tests.
 */
export function classifyEvent(event: LiveEventLike): EventMapping | null {
  const payload = event.payload ?? {};
  if (event.type === "heartbeat.run.status" && payload.status === "failed") {
    const agentName =
      typeof payload.agentName === "string" ? payload.agentName : "agente";
    return {
      key: "runFailed",
      render: () => `🔴 Run fallito (${agentName})`,
    };
  }
  if (event.type === "activity.logged") {
    const kind = typeof payload.kind === "string" ? payload.kind : "";
    if (kind === "approval.created" || kind === "approval_created") {
      return {
        key: "approvalsPending",
        render: () => `🟡 Nuova approval in pending. Usa /approvals.`,
      };
    }
    if (kind === "issue.errored" || kind === "issue_errored") {
      const ident = typeof payload.identifier === "string" ? payload.identifier : "—";
      return { key: "issueErrored", render: () => `⚠️ Issue in errore: ${ident}` };
    }
    if (kind === "agent.hired" || kind === "agent_hired") {
      const name = typeof payload.name === "string" ? payload.name : "nuovo agente";
      return { key: "agentHired", render: () => `✅ Agente assunto: ${name}` };
    }
  }
  return null;
}

export class Notifier {
  private subscriptions = new Map<string, () => void>(); // chatId → unsubscribe
  private lastSent = new Map<string, number>(); // `${chatId}:${key}` → ts
  private readonly dedupWindowMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: NotifierOptions) {
    this.dedupWindowMs = opts.dedupWindowMs ?? DEFAULT_DEDUP_MS;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Subscribe to live events for every session with a selected company. */
  start(): void {
    for (const session of this.opts.store.list()) {
      this.subscribeSession(session);
    }
  }

  /** (Re)subscribe a single session — called on company switch. */
  subscribeSession(session: SessionState): void {
    this.unsubscribeSession(session.chatId);
    if (!session.companyId) return;
    const unsub = this.opts.subscribeCompanyLiveEvents(session.companyId, (event) => {
      void this.onEvent(session.chatId, event).catch((err) => {
        this.opts.logger?.error?.(
          { err: (err as Error).message, chatId: session.chatId },
          "notifier onEvent failed",
        );
      });
    });
    this.subscriptions.set(session.chatId, unsub);
  }

  unsubscribeSession(chatId: string): void {
    const unsub = this.subscriptions.get(chatId);
    if (unsub) {
      try {
        unsub();
      } catch {
        // ignore
      }
      this.subscriptions.delete(chatId);
    }
  }

  stop(): void {
    for (const [chatId, unsub] of this.subscriptions.entries()) {
      try {
        unsub();
      } catch {
        // ignore
      }
      this.subscriptions.delete(chatId);
    }
  }

  private async onEvent(chatId: string, event: LiveEventLike): Promise<void> {
    const session = this.opts.store.get(chatId);
    if (!session) return;
    const mapping = classifyEvent(event);
    if (!mapping) return;
    if (!session.notifyOn[mapping.key]) return;
    const dedupKey = `${chatId}:${mapping.key}`;
    const now = this.now();
    // First time we see this dedup key → always send. The rate limit only
    // kicks in on the *second* occurrence within the window. (A default of 0
    // would block the very first event if the real clock is < window ms into
    // epoch in tests.)
    if (this.lastSent.has(dedupKey)) {
      const last = this.lastSent.get(dedupKey)!;
      if (now - last < this.dedupWindowMs) return;
    }
    this.lastSent.set(dedupKey, now);
    const text = mapping.render(event);
    await this.opts.transport.sendMessage(chatId, text).catch((err) => {
      this.opts.logger?.warn?.(
        { err: (err as Error).message, chatId },
        "notifier send failed",
      );
    });
  }
}
