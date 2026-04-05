// S43 — Telegram CEO Bot — notifier (live-events → Telegram bridge)
//
// For every session that has a selected companyId, we subscribe to the
// paperclip live-events bus and forward interesting events to Telegram.
// Notifications respect per-session `notifyOn` prefs and are rate-limited
// per chat_id + kind (10 s dedup by default) to avoid burst spam.
//
// The live-events bus is injected (not imported) so tests can provide a
// trivial fake without pulling the real singleton.

import { DigestComposer } from "./digest.js";
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
  /** Digest composer window. Defaults to 90 s when unset. */
  digestWindowMs?: number;
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
  /**
   * S43-3: when set, the notifier MUST skip the event if the actor (from
   * `payload.actorId`) matches this session userId. Used for approval
   * decisions: an approval the founder themselves resolved should not echo
   * back as a notification.
   */
  skipIfActorIs?: string;
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

  const actorId = typeof payload.actorId === "string" ? payload.actorId : "";

  if (action === "approval.created") {
    return {
      key: "approvalsPending",
      text: "🟡 Nuova approval in pending. Usa /approvals.",
    };
  }
  if (action === "agent.created" || action === "agent.hire_created" || action === "agent.hired") {
    const name = asString(details.name, "nuovo agente");
    const role = asString(details.role, "");
    const roleSuffix = role ? ` (${role})` : "";
    return { key: "agentHired", text: `✅ Agente assunto: *${name}*${roleSuffix}` };
  }

  // S43-3: approval resolved by someone other than the founder. We emit the
  // event unconditionally here; the notifier drops it via `skipIfActorIs`
  // when `payload.actorId === session.userId`, so approvals the founder
  // themselves decided don't echo back to Telegram.
  if (
    action === "approval.approved" ||
    action === "approval.rejected" ||
    action === "approval.revision_requested"
  ) {
    const verb =
      action === "approval.approved"
        ? "approvata"
        : action === "approval.rejected"
          ? "rifiutata"
          : "rinviata per revisione";
    const icon =
      action === "approval.approved" ? "✅" : action === "approval.rejected" ? "🚫" : "🔁";
    const type = asString(details.type ?? details.approvalType, "approval");
    const id = asString(entityId, "—");
    return {
      key: "approvalResolved",
      text: `${icon} Approval ${verb}: \`${id}\` (${type})`,
      skipIfActorIs: actorId,
    };
  }

  // S43-3: budget threshold crossings. These are always important.
  if (action === "budget.hard_threshold_crossed") {
    const scope = asString(details.scopeType, "budget");
    return {
      key: "budgetAlert",
      text: `🔴 *Budget hard limit superato* (${scope}). Agenti probabilmente in pausa.`,
    };
  }
  if (action === "budget.soft_threshold_crossed") {
    const scope = asString(details.scopeType, "budget");
    return {
      key: "budgetAlert",
      text: `🟠 Budget soft limit superato (${scope}).`,
    };
  }
  if (action === "budget.incident_resolved") {
    return { key: "budgetAlert", text: "🟢 Budget incident risolto." };
  }

  // S43-3: agent lifecycle — paused / terminated / resumed. We skip
  // "resumed" because it's usually a positive-signal that doesn't need a
  // push. Paused + terminated are the events that change how the org is
  // working and deserve a notification.
  if (action === "agent.paused") {
    const name = asString(details.name, "un agente");
    const reason = asString(details.pauseReason ?? details.reason, "");
    const reasonSuffix = reason ? ` (${reason})` : "";
    return {
      key: "agentLifecycle",
      text: `⏸️ Agente in pausa: *${name}*${reasonSuffix}`,
      skipIfActorIs: actorId,
    };
  }
  if (action === "agent.terminated") {
    const name = asString(details.name, "un agente");
    return {
      key: "agentLifecycle",
      text: `⛔ Agente terminato: *${name}*`,
      skipIfActorIs: actorId,
    };
  }

  // S43-3: issue suspension expired — the task is back in scope.
  if (action === "issue.suspend_expired") {
    const ident = asString(details.identifier, "—");
    return {
      key: "issueUnsuspended",
      text: `⏰ Sospensione scaduta: *${ident}* è di nuovo attivo.`,
    };
  }

  // S43-3: hire hook failure (something went wrong in the post-hire pipeline).
  if (action === "hire_hook.failed" || action === "hire_hook.error") {
    const name = asString(details.name ?? details.agentName, "nuovo agente");
    const err = asString(details.error ?? details.message, "");
    const errSuffix = err ? `\n_${err}_` : "";
    return {
      key: "hireFailed",
      text: `❌ Hire hook fallito per *${name}*.${errSuffix}`,
    };
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
  private readonly digest: DigestComposer;

  constructor(private readonly opts: NotifierOptions) {
    this.dedupWindowMs = opts.dedupWindowMs ?? DEFAULT_DEDUP_MS;
    this.now = opts.now ?? (() => Date.now());
    this.digest = new DigestComposer({
      transport: opts.transport,
      windowMs: opts.digestWindowMs,
      now: opts.now,
      logger: opts.logger,
    });
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

    // S43-3: if the mapping declares `skipIfActorIs` and the actor matches
    // this session's paperclip userId, drop the event — e.g. approvals the
    // founder themselves resolved, or agent lifecycle events they triggered.
    if (mapping.skipIfActorIs && mapping.skipIfActorIs === session.userId) return;

    // S43-3: digest mode — for agent-initiated events on owned issues, route
    // to the DigestComposer instead of sending a raw push. The composer
    // batches multiple comments + a terminal status into a single summary
    // message per issue. Skipped if the session has disabled digests, or
    // when the event doesn't carry an `ownerCheckIssueId` (non-issue events
    // never enter the digest — they're always immediate).
    if (session.digestEnabled && mapping.ownerCheckIssueId) {
      const payload = event.payload ?? {};
      const details =
        typeof payload.details === "object" && payload.details !== null
          ? (payload.details as Record<string, unknown>)
          : {};
      const action = typeof payload.action === "string" ? payload.action : "";
      const identifier = typeof details.identifier === "string" ? details.identifier : "—";
      const title =
        typeof details.issueTitle === "string"
          ? details.issueTitle
          : typeof details.title === "string"
            ? details.title
            : "";
      if (action === "issue.comment_added") {
        const snippet = typeof details.bodySnippet === "string" ? details.bodySnippet : "";
        this.digest.addComment({
          chatId,
          issueId: mapping.ownerCheckIssueId,
          identifier,
          title,
          snippet,
        });
        return;
      }
      if (action === "issue.updated") {
        const status = typeof details.status === "string" ? details.status : "";
        if (status === "done" || status === "cancelled") {
          this.digest.addTerminalStatus({
            chatId,
            issueId: mapping.ownerCheckIssueId,
            identifier,
            title,
            status,
          });
          return;
        }
      }
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

  /** Flush all pending digest buckets. Called on shutdown. */
  flushDigests(): void {
    this.digest.flushAll();
  }
}
