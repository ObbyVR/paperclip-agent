import type { Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { issueService } from "./issues.js";
import { logActivity } from "./activity-log.js";

/**
 * Suspend wake-up tick — clears `suspendedUntil` / `suspendedAt` / `suspendReason`
 * on every issue whose deadline has passed. Called from the heartbeat
 * scheduler loop so we don't need a dedicated interval; the heartbeat cadence
 * (typically every few seconds to a minute) is more than enough resolution
 * for "1 ora / 4 ore / Domani 9:00" style reminders.
 *
 * Returns the number of issues that were woken so the caller can log it.
 */
export async function tickSuspendWakeup(db: Db, now: Date = new Date()): Promise<number> {
  const svc = issueService(db);
  const woken = await svc.wakeExpiredSuspensions(now);
  if (woken.length === 0) return 0;

  // Emit an activity-log entry per company so the UI can surface "N alert sono
  // tornati dalla sospensione". We batch by company to keep the log concise.
  const byCompany = new Map<string, string[]>();
  for (const row of woken) {
    const list = byCompany.get(row.companyId) ?? [];
    list.push(row.id);
    byCompany.set(row.companyId, list);
  }
  for (const [companyId, issueIds] of byCompany) {
    await logActivity(db, {
      companyId,
      actorType: "system",
      actorId: "suspend-wakeup",
      action: "issue.suspend_expired",
      entityType: "issue",
      entityId: issueIds[0],
      details: { count: issueIds.length, issueIds, at: now.toISOString() },
    }).catch((err) => {
      logger.warn({ err, companyId }, "failed to log issue.suspend_expired activity");
    });
  }

  logger.info({ woken: woken.length }, "suspend wake-up tick cleared expired suspensions");
  return woken.length;
}
