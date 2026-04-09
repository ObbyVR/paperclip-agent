import type { Db } from "@paperclipai/db";
import { notifications } from "@paperclipai/db";
import { and, eq, isNull, lt, lte, desc, sql } from "drizzle-orm";
import { publishLiveEvent } from "./live-events.js";
import { logger } from "../middleware/logger.js";

export interface CreateNotificationInput {
  companyId: string;
  userId?: string | null;
  type: string;
  severity: "critical" | "high" | "medium" | "info";
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  agentId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Notification event types that should generate persistent notifications */
const NOTIFIABLE_ACTIONS: Record<string, { type: string; severity: "critical" | "high" | "medium" | "info" }> = {
  "approval.created": { type: "approval_pending", severity: "critical" },
  "agent.error": { type: "agent_error", severity: "high" },
  "issue.comment_added": { type: "issue_comment", severity: "medium" },
  "join_request.created": { type: "join_request", severity: "medium" },
};

/** Actions that map to run failures via heartbeat status */
const RUN_FAILURE_STATUSES = new Set(["failed", "timed_out"]);

export function notificationService(db: Db) {
  return {
    /** Create a new notification */
    async create(input: CreateNotificationInput): Promise<string> {
      const [row] = await db
        .insert(notifications)
        .values({
          companyId: input.companyId,
          userId: input.userId ?? null,
          type: input.type,
          severity: input.severity,
          title: input.title,
          body: input.body ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          agentId: input.agentId ?? null,
          metadata: input.metadata ?? null,
        })
        .returning({ id: notifications.id });

      // Broadcast via WebSocket
      publishLiveEvent({
        companyId: input.companyId,
        type: "activity.logged",
        payload: {
          action: "notification.created",
          entityType: "notification",
          entityId: row.id,
          details: {
            notificationType: input.type,
            severity: input.severity,
            title: input.title,
          },
        },
      });

      return row.id;
    },

    /** List notifications for a company/user, most recent first */
    async list(
      companyId: string,
      opts?: { userId?: string; includeRead?: boolean; includeDismissed?: boolean; limit?: number },
    ) {
      const conditions = [eq(notifications.companyId, companyId)];

      // Show notifications targeted at this user OR broadcast (userId = null)
      if (opts?.userId) {
        conditions.push(
          sql`(${notifications.userId} = ${opts.userId} OR ${notifications.userId} IS NULL)`,
        );
      }

      if (!opts?.includeRead) {
        conditions.push(isNull(notifications.readAt));
      }
      if (!opts?.includeDismissed) {
        conditions.push(isNull(notifications.dismissedAt));
      }

      return db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(opts?.limit ?? 50);
    },

    /** Count unread notifications by severity */
    async countUnread(companyId: string, userId?: string) {
      const conditions = [
        eq(notifications.companyId, companyId),
        isNull(notifications.readAt),
        isNull(notifications.dismissedAt),
      ];
      if (userId) {
        conditions.push(
          sql`(${notifications.userId} = ${userId} OR ${notifications.userId} IS NULL)`,
        );
      }

      const rows = await db
        .select({
          severity: notifications.severity,
          count: sql<number>`count(*)`,
        })
        .from(notifications)
        .where(and(...conditions))
        .groupBy(notifications.severity);

      const counts = { critical: 0, high: 0, medium: 0, info: 0, total: 0 };
      for (const r of rows) {
        const s = r.severity as keyof typeof counts;
        if (s in counts) counts[s] = Number(r.count);
        counts.total += Number(r.count);
      }
      return counts;
    },

    /** Mark a notification as read */
    async markRead(notificationId: string, companyId: string) {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, notificationId), eq(notifications.companyId, companyId)));
    },

    /** Mark all notifications as read for a user/company */
    async markAllRead(companyId: string, userId?: string) {
      const conditions = [
        eq(notifications.companyId, companyId),
        isNull(notifications.readAt),
      ];
      if (userId) {
        conditions.push(
          sql`(${notifications.userId} = ${userId} OR ${notifications.userId} IS NULL)`,
        );
      }
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(...conditions));
    },

    /** Dismiss a notification (won't show again) */
    async dismiss(notificationId: string, companyId: string) {
      await db
        .update(notifications)
        .set({ dismissedAt: new Date() })
        .where(and(eq(notifications.id, notificationId), eq(notifications.companyId, companyId)));
    },

    /** Escalation: find critical unread notifications older than N hours, re-notify */
    async escalateStale(maxEscalations = 3, staleHours = 2) {
      const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000);
      const stale = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.severity, "critical"),
            isNull(notifications.readAt),
            isNull(notifications.dismissedAt),
            lt(notifications.escalationCount, maxEscalations),
            lte(notifications.createdAt, cutoff),
          ),
        )
        .limit(50);

      let escalated = 0;
      for (const n of stale) {
        // Only escalate if last escalation was also > staleHours ago
        if (n.escalatedAt && n.escalatedAt > cutoff) continue;

        await db
          .update(notifications)
          .set({
            escalatedAt: new Date(),
            escalationCount: n.escalationCount + 1,
          })
          .where(eq(notifications.id, n.id));

        publishLiveEvent({
          companyId: n.companyId,
          type: "activity.logged",
          payload: {
            action: "notification.escalated",
            entityType: "notification",
            entityId: n.id,
            details: {
              notificationType: n.type,
              escalationCount: n.escalationCount + 1,
              title: n.title,
            },
          },
        });

        escalated++;
      }

      if (escalated > 0) {
        logger.info({ escalated }, "notification escalation completed");
      }
      return escalated;
    },

    /**
     * Hook: called from logActivity to auto-create notifications for relevant events.
     * Returns the notification ID if created, null otherwise.
     */
    async maybeCreateFromActivity(
      companyId: string,
      action: string,
      entityType: string,
      entityId: string,
      agentId?: string | null,
      details?: Record<string, unknown> | null,
    ): Promise<string | null> {
      const mapping = NOTIFIABLE_ACTIONS[action];
      if (!mapping) {
        // Check for run failures
        if (action === "heartbeat.run.status") {
          const status = details?.status as string | undefined;
          if (status && RUN_FAILURE_STATUSES.has(status)) {
            const agentName = (details?.agentName as string) ?? "Agente";
            return this.create({
              companyId,
              type: "run_failed",
              severity: "high",
              title: `Run fallito: ${agentName}`,
              body: (details?.error as string) ?? `Status: ${status}`,
              entityType,
              entityId,
              agentId,
              metadata: details,
            });
          }
        }
        return null;
      }

      // Build title based on action type
      let title = "";
      let body: string | null = null;

      switch (mapping.type) {
        case "approval_pending": {
          const approvalType = (details?.type as string) ?? "approvazione";
          title = `Nuova approvazione: ${approvalType.replaceAll("_", " ")}`;
          break;
        }
        case "agent_error": {
          const agentName = (details?.agentName as string) ?? "Agente";
          title = `Errore agente: ${agentName}`;
          body = (details?.error as string) ?? null;
          break;
        }
        case "issue_comment": {
          const actorName = (details?.actorName as string) ?? "Agente";
          const issueIdentifier = (details?.issueIdentifier as string) ?? entityId;
          title = `Commento da ${actorName} su ${issueIdentifier}`;
          body = (details?.bodySnippet as string) ?? null;
          break;
        }
        case "join_request": {
          title = "Nuova richiesta di accesso";
          break;
        }
      }

      return this.create({
        companyId,
        type: mapping.type,
        severity: mapping.severity,
        title,
        body,
        entityType,
        entityId,
        agentId,
        metadata: details,
      });
    },
  };
}
