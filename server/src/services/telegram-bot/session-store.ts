// S43 — Telegram CEO Bot — session persistence
//
// Stores per-chat state in a single JSON file on disk. Zero DB migration.
// Writes are debounced (default 500 ms) and atomic (write to .tmp, rename).
// Load failures (missing / corrupted) fall back to an empty map and log via
// the optional logger — never throw, never crash the server.
//
// One instance per bot. Thread-safety is not a concern: the bot runs in a
// single Node event loop, and mutations are always async-sequential.

import { promises as fs } from "node:fs";
import path from "node:path";
import { defaultNotifyOn, OWNED_ISSUES_MAX, type SessionState } from "./types.js";

export interface SessionStoreLogger {
  info?: (obj: Record<string, unknown>, msg: string) => void;
  warn?: (obj: Record<string, unknown>, msg: string) => void;
  error?: (obj: Record<string, unknown>, msg: string) => void;
}

export interface SessionStoreOptions {
  filePath: string;
  debounceMs?: number;
  logger?: SessionStoreLogger;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

const DEFAULT_DEBOUNCE_MS = 500;

export class SessionStore {
  private readonly filePath: string;
  private readonly debounceMs: number;
  private readonly logger?: SessionStoreLogger;
  private readonly now: () => Date;

  private sessions: Map<string, SessionState> = new Map();
  private loaded = false;
  private dirty = false;
  private writeTimer: NodeJS.Timeout | null = null;
  private writing = false;
  private pendingWrite: Promise<void> | null = null;

  constructor(opts: SessionStoreOptions) {
    this.filePath = opts.filePath;
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.logger = opts.logger;
    this.now = opts.now ?? (() => new Date());
  }

  /** Load sessions from disk. Idempotent — second call is a no-op. */
  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const validated = this.validate(parsed);
      this.sessions = new Map(validated.map((s) => [s.chatId, s]));
      this.logger?.info?.({ count: this.sessions.size, path: this.filePath }, "telegram sessions loaded");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "ENOENT") {
        // First run — no file yet, that's fine.
        this.sessions = new Map();
        this.logger?.info?.({ path: this.filePath }, "no telegram sessions file, starting fresh");
      } else {
        this.logger?.error?.(
          { err: (err as Error).message, path: this.filePath },
          "failed to load telegram sessions, starting fresh",
        );
        this.sessions = new Map();
      }
    } finally {
      this.loaded = true;
    }
  }

  /**
   * Zod-free validation. We intentionally do not import Zod here to keep this
   * module tree-shakeable and the dependency surface minimal. The shape is
   * small and the failure mode is "start fresh" so we don't need full schema
   * errors — we just need a safe, total filter.
   */
  private validate(raw: unknown): SessionState[] {
    if (!Array.isArray(raw)) return [];
    const out: SessionState[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      if (typeof obj.chatId !== "string" || obj.chatId === "") continue;
      if (typeof obj.userId !== "string" || obj.userId === "") continue;
      const notify = obj.notifyOn as Record<string, unknown> | undefined;
      const defaults = defaultNotifyOn();
      const ownedRaw = Array.isArray(obj.ownedIssueIds) ? obj.ownedIssueIds : [];
      const ownedIssueIds: string[] = [];
      for (const v of ownedRaw) {
        if (typeof v === "string" && v !== "") ownedIssueIds.push(v);
        if (ownedIssueIds.length >= OWNED_ISSUES_MAX) break;
      }
      const session: SessionState = {
        chatId: obj.chatId,
        userId: obj.userId,
        companyId: typeof obj.companyId === "string" ? obj.companyId : null,
        ceoAgentId: typeof obj.ceoAgentId === "string" ? obj.ceoAgentId : null,
        digestEnabled:
          typeof obj.digestEnabled === "boolean" ? obj.digestEnabled : true,
        notifyOn: {
          approvalsPending:
            typeof notify?.approvalsPending === "boolean"
              ? notify.approvalsPending
              : defaults.approvalsPending,
          runFailed:
            typeof notify?.runFailed === "boolean" ? notify.runFailed : defaults.runFailed,
          issueErrored:
            typeof notify?.issueErrored === "boolean" ? notify.issueErrored : defaults.issueErrored,
          agentHired:
            typeof notify?.agentHired === "boolean" ? notify.agentHired : defaults.agentHired,
          agentReplied:
            typeof notify?.agentReplied === "boolean" ? notify.agentReplied : defaults.agentReplied,
          approvalResolved:
            typeof notify?.approvalResolved === "boolean"
              ? notify.approvalResolved
              : defaults.approvalResolved,
          budgetAlert:
            typeof notify?.budgetAlert === "boolean" ? notify.budgetAlert : defaults.budgetAlert,
          agentLifecycle:
            typeof notify?.agentLifecycle === "boolean"
              ? notify.agentLifecycle
              : defaults.agentLifecycle,
          issueUnsuspended:
            typeof notify?.issueUnsuspended === "boolean"
              ? notify.issueUnsuspended
              : defaults.issueUnsuspended,
          hireFailed:
            typeof notify?.hireFailed === "boolean" ? notify.hireFailed : defaults.hireFailed,
        },
        ownedIssueIds,
        updatedAt:
          typeof obj.updatedAt === "string" ? obj.updatedAt : new Date(0).toISOString(),
      };
      out.push(session);
    }
    return out;
  }

  get(chatId: string): SessionState | undefined {
    return this.sessions.get(chatId);
  }

  list(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Creates the session if missing (using defaults + given userId), then
   * applies the patch and schedules a persistent write. Returns the updated
   * session so the caller can avoid a second `get()`.
   */
  upsert(chatId: string, userId: string, patch: Partial<Omit<SessionState, "chatId" | "userId">>): SessionState {
    const existing = this.sessions.get(chatId);
    const base: SessionState = existing ?? {
      chatId,
      userId,
      companyId: null,
      ceoAgentId: null,
      notifyOn: defaultNotifyOn(),
      ownedIssueIds: [],
      digestEnabled: true,
      updatedAt: this.now().toISOString(),
    };
    const next: SessionState = {
      ...base,
      ...patch,
      // userId is re-pinned from the allowlist on every upsert so a rotated
      // mapping takes effect without wiping the file.
      userId,
      notifyOn: patch.notifyOn ? { ...base.notifyOn, ...patch.notifyOn } : base.notifyOn,
      updatedAt: this.now().toISOString(),
    };
    this.sessions.set(chatId, next);
    this.markDirty();
    return next;
  }

  /**
   * Record that this chat created the given issue via the bot. Used by the
   * notifier to filter agent-side events to only the founder's own tasks.
   * FIFO-bounded to OWNED_ISSUES_MAX per session.
   */
  trackOwnedIssue(chatId: string, issueId: string): void {
    const session = this.sessions.get(chatId);
    if (!session) return;
    if (session.ownedIssueIds.includes(issueId)) return;
    const next = [...session.ownedIssueIds, issueId];
    while (next.length > OWNED_ISSUES_MAX) next.shift();
    session.ownedIssueIds = next;
    session.updatedAt = this.now().toISOString();
    this.markDirty();
  }

  /** True iff this chat is the founder-owner of the given issue. */
  ownsIssue(chatId: string, issueId: string): boolean {
    return this.sessions.get(chatId)?.ownedIssueIds.includes(issueId) ?? false;
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.flush().catch((err) => {
        this.logger?.error?.({ err: (err as Error).message }, "telegram session flush failed");
      });
    }, this.debounceMs);
    // Don't keep the process alive just for this timer.
    if (typeof this.writeTimer.unref === "function") this.writeTimer.unref();
  }

  /** Force an immediate write. Used on shutdown and in tests. */
  async flush(): Promise<void> {
    if (!this.dirty) return;
    if (this.writing) {
      // A write is in-flight; chain.
      await this.pendingWrite;
      if (!this.dirty) return;
    }
    this.writing = true;
    this.dirty = false;
    this.pendingWrite = (async () => {
      try {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        const payload = JSON.stringify(Array.from(this.sessions.values()), null, 2);
        await fs.writeFile(tmp, payload, "utf8");
        await fs.rename(tmp, this.filePath);
      } finally {
        this.writing = false;
      }
    })();
    try {
      await this.pendingWrite;
    } finally {
      this.pendingWrite = null;
    }
  }

  /** Cancel any pending debounced write. Does NOT flush. Used in shutdown after a final flush(). */
  cancel(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
  }
}
