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

export type EventMapping = {
  key: NotifyKey;
  text: string;
  /**
   * S43-2: when set, the notifier MUST confirm the session owns this issue
   * (via SessionStore.ownsIssue) before sending the notification. Used for
   * agent-initiated events like comment_added / task completed.
   */
  ownerCheckIssueId?: string;
};

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v !== "" ? v : fallback;
}

/**
 * Classify a live event into a notify key + rendered message. Returns null
 * if the event is not one we want to forward.
 *
 * Paperclip's activity-log events expose `action` at the top of the
 * `activity.logged` payload, plus the actor and details. We inspect both.
 *
 * This function is pure; `ownerCheckIssueId` is propagated up so the
 * notifier can gate on ownership before sending.
 */
export function classifyEvent(event: LiveEventLike): EventMapping | null {
  const payload = event.payload ?? {};
  if (event.type === "heartbeat.run.status" && payload.status === "failed") {
    const agentName = asString(payload.agentName, "agente");
    return { key: "runFailed", text: `🔴 Run fallito (${agentName})` };
  }
  if (event.type !== "activity.logged") return null;

  const action = typeof payload.action === "string" ? payload.action : "";
  const actorType = typeof payload.actorType === "string" ? payload.actorType : "";
  const entityType = typeof payload.entityType === "string" ? payload.entityType : "";
  const entityId = typeof payload.entityId === "string" ? payload.entityId : "";
  const details =
    typeof payload.details === "object" && payload.details !== null
      ? (payload.details as Record<string, unknown>)
      : {};

  if (action === "approval.created") {
    return {
      key: "approvalsPending",
      text: "🟡 Nuova approval in pending. Usa /approvals.",
    };
  }
  if (action === "agent.created" || action === "agent.hired") {
    const name = asString(details.name, "nuovo agente");
    return { key: "agentHired", text: `✅ Agente assunto: ${name}` };
  }
  if (action === "issue.errored") {
    const ident = asString(details.identifier, "—");
    return { key: "issueErrored", text: `⚠️ Issue in errore: ${ident}` };
  }

  // S43-2: agent-initiated events on bot-owned issues.
  // We only notify when actorType === "agent" — a comment by the founder
  // themself would echo back to Telegram otherwise.
  if (entityType !== "issue" || actorType !== "agent" || entityId === "") return null;

  if (action === "issue.comment_added") {
    const ident = asString(details.identifier, "—");
    const title = asString(details.issueTitle, "");
    const snippet = asString(details.bodySnippet, "").trim();
    const preview = snippet.length > 300 ? snippet.slice(0, 297) + "…" : snippet;
    const titleLine = title ? `\n_${title}_` : "";
    return {
      key: "agentReplied",
      text: `💬 *${ident}* — nuovo commento dall'agente${titleLine}\n\n${preview}`,
      ownerCheckIssueId: entityId,
    };
  }
  if (action === "issue.updated") {
    const status = typeof details.status === "string" ? details.status : "";
    if (status !== "done") return null;
    const ident = asString(details.identifier, "—");
    const title = asString(details.issueTitle ?? details.title, "");
    const titleLine = title ? `\n_${title}_` : "";
    return {
      key: "agentReplied",
      text: `✅ *${ident}* completata dall'agente${titleLine}`,
      ownerCheckIssueId: entityId,
    };
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

    // S43-2: if the mapping requires ownership (agent-initiated events like
    // comment_added), verify this chat actually created the issue via the
    // bot. Otherwise we'd spam the founder with replies to tasks that
    // agents are discussing among themselves.
    if (mapping.ownerCheckIssueId) {
      if (!this.opts.store.ownsIssue(chatId, mapping.ownerCheckIssueId)) return;
    }

    const dedupKey = `${chatId}:${mapping.key}:${mapping.ownerCheckIssueId ?? ""}`;
    const now = this.now();
    // First time we see this dedup key → always send. The rate limit only
    // kicks in on the *second* occurrence within the window.
    if (this.lastSent.has(dedupKey)) {
      const last = this.lastSent.get(dedupKey)!;
      if (now - last < this.dedupWindowMs) return;
    }
    this.lastSent.set(dedupKey, now);
    await this.opts.transport
      .sendMessage(chatId, mapping.text, { parse_mode: "Markdown" })
      .catch((err) => {
        this.opts.logger?.warn?.(
          { err: (err as Error).message, chatId },
          "notifier send failed",
        );
      });
  }
}
