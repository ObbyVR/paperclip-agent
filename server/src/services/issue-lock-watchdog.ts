import { and, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues, heartbeatRuns } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";

/**
 * Issue-lock watchdog — safety net for stuck execution locks.
 *
 * The heartbeat reaper (`heartbeat.reapOrphanedRuns`) already releases issue
 * locks when it finalises a dead run via `releaseIssueExecutionAndPromote`.
 * In practice, however, we still end up with a handful of orphaned locks
 * (13 counted at S41) because:
 *
 *   1. `releaseIssueExecutionAndPromote` only touches the row whose
 *      `executionRunId` matches the finalised run, and only clears
 *      `executionRunId`/`executionAgentNameKey`/`executionLockedAt`. If
 *      `checkoutRunId` was left pointing at a run that later transitioned
 *      to a terminal state through another code path, the checkout lock
 *      stays attached forever.
 *   2. Races between `setRunStatus(terminal)` and the issue update can
 *      leave `executionLockedAt` pinned while the run is already
 *      `succeeded`/`failed`.
 *   3. Legacy rows from before reaper improvements — they never get a
 *      fresh reap pass because nothing re-examines them.
 *
 * This watchdog is a *second line of defence*. It only releases locks; it
 * never changes `status`, so the state machine is untouched. A released
 * lock simply means the issue becomes eligible for check-out by the next
 * wake — same semantics as a completed run.
 *
 * Criteria for release (logical OR):
 *   - The referenced run is in a terminal status (`succeeded`, `failed`,
 *     `cancelled`, `timed_out`), or
 *   - The referenced run has been deleted (dangling FK that was set to
 *     NULL via ON DELETE SET NULL, leaving lock timestamps without a run), or
 *   - `executionLockedAt` is older than `staleThresholdMs` (default 30 min),
 *     regardless of run status — covers the case where the in-memory
 *     process is wedged but the DB hasn't been updated.
 *
 * Released fields: `checkoutRunId`, `executionRunId`, `executionAgentNameKey`,
 * `executionLockedAt` → all set to NULL. The issue `status` and every other
 * field is left alone.
 *
 * Audit: every released issue gets an `issue.lock_released` activity entry
 * with the lock metadata we just cleared.
 */

const TERMINAL_RUN_STATUSES = new Set(["succeeded", "failed", "cancelled", "timed_out"]);

export interface WatchdogOptions {
  /** Max number of locks to release per tick. Keeps a single pass bounded. */
  maxReleasesPerTick?: number;
  /** Age threshold in ms after which a lock is considered stale regardless of run status. */
  staleThresholdMs?: number;
}

export interface WatchdogResult {
  scanned: number;
  released: number;
  releasedIssueIds: string[];
}

export async function tickIssueLockWatchdog(
  db: Db,
  options: WatchdogOptions = {},
  now: Date = new Date(),
): Promise<WatchdogResult> {
  const maxReleasesPerTick = options.maxReleasesPerTick ?? 50;
  const staleThresholdMs = options.staleThresholdMs ?? 30 * 60 * 1000;
  const staleCutoff = new Date(now.getTime() - staleThresholdMs);

  // Fetch candidate rows: any issue that carries a lock field. The set is
  // small in practice (one row per in-flight execution + whatever is stuck),
  // so we don't need pagination — `maxReleasesPerTick` bounds the write side.
  const candidates = await (db as any)
    .select({
      id: issues.id,
      companyId: issues.companyId,
      checkoutRunId: issues.checkoutRunId,
      executionRunId: issues.executionRunId,
      executionLockedAt: issues.executionLockedAt,
      executionAgentNameKey: issues.executionAgentNameKey,
      checkoutRunStatus: sql<string | null>`(SELECT status FROM heartbeat_runs WHERE id = ${issues.checkoutRunId})`,
      executionRunStatus: sql<string | null>`(SELECT status FROM heartbeat_runs WHERE id = ${issues.executionRunId})`,
    })
    .from(issues)
    .where(
      or(
        isNotNull(issues.checkoutRunId),
        isNotNull(issues.executionRunId),
        isNotNull(issues.executionLockedAt),
      ),
    );

  const scanned = candidates.length;
  const toRelease: Array<{
    id: string;
    companyId: string;
    reason: "terminal_run" | "stale_lock" | "dangling";
    before: {
      checkoutRunId: string | null;
      executionRunId: string | null;
      executionLockedAt: string | null;
      executionAgentNameKey: string | null;
    };
  }> = [];

  for (const row of candidates) {
    if (toRelease.length >= maxReleasesPerTick) break;

    const checkoutTerminal =
      row.checkoutRunId != null && row.checkoutRunStatus != null && TERMINAL_RUN_STATUSES.has(row.checkoutRunStatus);
    const executionTerminal =
      row.executionRunId != null && row.executionRunStatus != null && TERMINAL_RUN_STATUSES.has(row.executionRunStatus);
    const executionDangling =
      row.executionRunId != null && row.executionRunStatus == null;
    const checkoutDangling =
      row.checkoutRunId != null && row.checkoutRunStatus == null;
    const lockStale =
      row.executionLockedAt != null && new Date(row.executionLockedAt).getTime() < staleCutoff.getTime();

    if (!checkoutTerminal && !executionTerminal && !executionDangling && !checkoutDangling && !lockStale) {
      continue;
    }

    const reason: "terminal_run" | "stale_lock" | "dangling" =
      executionDangling || checkoutDangling
        ? "dangling"
        : checkoutTerminal || executionTerminal
          ? "terminal_run"
          : "stale_lock";

    toRelease.push({
      id: row.id,
      companyId: row.companyId,
      reason,
      before: {
        checkoutRunId: row.checkoutRunId,
        executionRunId: row.executionRunId,
        executionLockedAt: row.executionLockedAt ? new Date(row.executionLockedAt).toISOString() : null,
        executionAgentNameKey: row.executionAgentNameKey,
      },
    });
  }

  if (toRelease.length === 0) {
    return { scanned, released: 0, releasedIssueIds: [] };
  }

  const releasedIds: string[] = [];
  for (const entry of toRelease) {
    // Release per-row with a defensive WHERE so concurrent successful
    // updates (another code path clearing the lock normally) don't get
    // overwritten. We only clear fields that still match what we observed.
    const updated = await (db as any)
      .update(issues)
      .set({
        checkoutRunId: null,
        executionRunId: null,
        executionAgentNameKey: null,
        executionLockedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(issues.id, entry.id),
          // Guard against races: only update if at least one of the
          // lock fields is still set. If another transaction has already
          // cleared everything, this WHERE is false and the row is
          // untouched.
          or(
            isNotNull(issues.checkoutRunId),
            isNotNull(issues.executionRunId),
            isNotNull(issues.executionLockedAt),
          ),
        ),
      )
      .returning({ id: issues.id });

    if (updated.length === 0) continue;
    releasedIds.push(entry.id);

    await logActivity(db, {
      companyId: entry.companyId,
      actorType: "system",
      actorId: "issue-lock-watchdog",
      action: "issue.lock_released",
      entityType: "issue",
      entityId: entry.id,
      details: {
        reason: entry.reason,
        before: entry.before,
        at: now.toISOString(),
      },
    }).catch((err) => {
      logger.warn({ err, issueId: entry.id }, "failed to log issue.lock_released activity");
    });
  }

  if (releasedIds.length > 0) {
    logger.info(
      { scanned, released: releasedIds.length },
      "issue-lock-watchdog released stuck locks",
    );
  }

  return { scanned, released: releasedIds.length, releasedIssueIds: releasedIds };
}
