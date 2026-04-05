// S43-3 — Telegram CEO Bot — Digest composer ("Founder Liaison")
//
// Problem this solves:
//
// When an agent works on a task it often posts 3-5 short comments before
// finishing, plus a final completion event. Each one produced a separate
// Telegram push in S43-2, which is noisy on a phone.
//
// This module implements a bot-side "liaison" that batches events per
// `(chatId, issueId)` in a rolling window (default 90 s). When the window
// closes — or as soon as the terminal event arrives (`issue.updated` with
// status `done` / `cancelled`) — we emit a SINGLE digest message that
// summarizes everything that happened.
//
// The digest is controlled per-session via `/digest on|off` and the window
// length is fixed at creation time (per server process). The default is ON.
//
// The "figura" the user asked about is this composer: it acts like an
// assistant that reads the agent's stream-of-consciousness and writes a
// single report. No new paperclip agent, no new LLM call, no new cost.
// Everything happens inside the Telegram bot process in-memory.
//
// ------------------------------------------------------------------------
// Design notes:
//
//  * The digest only batches events that are part of the SAME issue; events
//    without an `issueId` (approvals, budget, agent lifecycle) bypass the
//    digest and are delivered immediately.
//
//  * The batch closes on three triggers:
//      1. explicit terminal event (issue completed / cancelled) → flush now
//      2. window timeout (default 90 s) → flush now
//      3. a new comment arriving reset is NOT a trigger (we accumulate)
//
//  * On flush we send ONE message formatted as:
//
//        💬 *WEB-158* — risposta dall'agente
//        _Titolo issue_
//
//        • commento 1 (snippet)
//        • commento 2 (snippet)
//        • …
//        ✅ Completata
//
//    The terminal line (✅/🚫) is appended only if a terminal event was
//    part of the batch; otherwise it's omitted (window-timeout flush).
//
//  * If the digest is DISABLED for a session we fall through to the raw
//    per-event notifier; this keeps the old behavior available.
//
//  * Memory: one entry per (chatId, issueId). Timers use `unref()` so the
//    process can still exit cleanly.
//
//  * Test-friendliness: `window`, `now`, and the actual sender are all
//    injected so tests can use fake timers + in-memory transport.

import type { TelegramTransport } from "./transport.js";

const DEFAULT_WINDOW_MS = 90_000;
const MAX_ENTRIES_PER_DIGEST = 8;
const MAX_COMMENT_LEN = 200;

/** One piece of agent output we want to include in the digest. */
export type DigestEntry =
  | { kind: "comment"; snippet: string }
  | { kind: "status"; status: "done" | "cancelled" | "blocked" | string };

interface Bucket {
  chatId: string;
  issueId: string;
  identifier: string;
  title: string;
  entries: DigestEntry[];
  openedAt: number;
  timer: NodeJS.Timeout | null;
  terminated: boolean;
}

export interface DigestSenderFn {
  (chatId: string, text: string): Promise<void>;
}

export interface DigestComposerOptions {
  transport: TelegramTransport;
  windowMs?: number;
  now?: () => number;
  /** Override the transport send for tests. */
  sender?: DigestSenderFn;
  logger?: {
    debug?: (obj: Record<string, unknown>, msg: string) => void;
    warn?: (obj: Record<string, unknown>, msg: string) => void;
  };
}

/**
 * Per-issue event batcher. Safe to have one instance per bot process.
 * Not thread-safe, which is fine because the bot runs on a single event
 * loop.
 */
export class DigestComposer {
  private buckets = new Map<string, Bucket>(); // key = chatId:issueId
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly send: DigestSenderFn;
  private readonly logger?: DigestComposerOptions["logger"];

  constructor(opts: DigestComposerOptions) {
    this.windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = opts.now ?? (() => Date.now());
    this.logger = opts.logger;
    this.send =
      opts.sender ??
      (async (chatId, text) => {
        await opts.transport.sendMessage(chatId, text, { parse_mode: "Markdown" });
      });
  }

  /**
   * Record an agent comment. Opens a bucket if none exists, otherwise
   * appends to the existing one and keeps the timer running.
   */
  addComment(params: {
    chatId: string;
    issueId: string;
    identifier: string;
    title: string;
    snippet: string;
  }): void {
    const bucket = this.ensureBucket(params.chatId, params.issueId, params.identifier, params.title);
    if (bucket.entries.length >= MAX_ENTRIES_PER_DIGEST) {
      // We've hit the soft cap — flush what we have and start a new bucket
      // so the next comments don't get lost in an overflow.
      this.flush(bucket);
      const next = this.ensureBucket(params.chatId, params.issueId, params.identifier, params.title);
      next.entries.push({ kind: "comment", snippet: clampSnippet(params.snippet) });
      return;
    }
    bucket.entries.push({ kind: "comment", snippet: clampSnippet(params.snippet) });
  }

  /**
   * Record a terminal status change. Triggers an immediate flush so the
   * founder knows the task is done without waiting for the window.
   */
  addTerminalStatus(params: {
    chatId: string;
    issueId: string;
    identifier: string;
    title: string;
    status: string;
  }): void {
    const bucket = this.ensureBucket(params.chatId, params.issueId, params.identifier, params.title);
    bucket.entries.push({ kind: "status", status: params.status });
    bucket.terminated = true;
    this.flush(bucket);
  }

  /** Flush all open buckets (used on shutdown). */
  flushAll(): void {
    for (const bucket of Array.from(this.buckets.values())) {
      this.flush(bucket);
    }
  }

  private ensureBucket(chatId: string, issueId: string, identifier: string, title: string): Bucket {
    const key = `${chatId}:${issueId}`;
    const existing = this.buckets.get(key);
    if (existing) return existing;

    const bucket: Bucket = {
      chatId,
      issueId,
      identifier,
      title,
      entries: [],
      openedAt: this.now(),
      timer: null,
      terminated: false,
    };
    bucket.timer = setTimeout(() => {
      bucket.timer = null;
      this.flush(bucket);
    }, this.windowMs);
    // Don't keep the process alive for a pending digest.
    if (typeof bucket.timer.unref === "function") bucket.timer.unref();
    this.buckets.set(key, bucket);
    return bucket;
  }

  private flush(bucket: Bucket): void {
    const key = `${bucket.chatId}:${bucket.issueId}`;
    if (!this.buckets.has(key)) return; // already flushed
    if (bucket.timer) {
      clearTimeout(bucket.timer);
      bucket.timer = null;
    }
    this.buckets.delete(key);

    if (bucket.entries.length === 0) return;

    const text = this.formatDigest(bucket);
    void this.send(bucket.chatId, text).catch((err) => {
      this.logger?.warn?.(
        { err: (err as Error).message, chatId: bucket.chatId, issueId: bucket.issueId },
        "digest send failed",
      );
    });
  }

  /** Pure rendering logic exposed for tests. */
  formatDigest(bucket: Bucket): string {
    const comments = bucket.entries.filter((e): e is Extract<DigestEntry, { kind: "comment" }> => e.kind === "comment");
    const statuses = bucket.entries.filter((e): e is Extract<DigestEntry, { kind: "status" }> => e.kind === "status");
    const hasTerminal = statuses.some((s) => s.status === "done" || s.status === "cancelled");

    const header = hasTerminal
      ? `✅ *${bucket.identifier}* — completata dall'agente`
      : `💬 *${bucket.identifier}* — aggiornamento dall'agente`;
    const titleLine = bucket.title ? `\n_${bucket.title}_` : "";

    let body = "";
    if (comments.length === 1) {
      body = `\n\n${comments[0].snippet}`;
    } else if (comments.length > 1) {
      body = "\n\n" + comments.map((c) => `• ${c.snippet}`).join("\n");
    }

    const terminalLine = hasTerminal
      ? (() => {
          const last = statuses[statuses.length - 1];
          if (last.status === "done") return "\n\n_Stato: done._";
          if (last.status === "cancelled") return "\n\n_Stato: cancelled._";
          return `\n\n_Stato: ${last.status}._`;
        })()
      : "";

    return `${header}${titleLine}${body}${terminalLine}`;
  }
}

function clampSnippet(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length <= MAX_COMMENT_LEN) return trimmed;
  return trimmed.slice(0, MAX_COMMENT_LEN - 1) + "…";
}
