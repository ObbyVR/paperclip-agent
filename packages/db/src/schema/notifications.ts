import { pgTable, uuid, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    /** Target user ID (null = broadcast to all users in company) */
    userId: text("user_id"),
    /** Notification kind: approval_pending, agent_error, issue_comment, run_failed, join_request */
    type: text("type").notNull(),
    /** Severity: critical, high, medium, info */
    severity: text("severity").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body"),
    /** What entity this notification refers to */
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    agentId: uuid("agent_id").references(() => agents.id),
    /** Extra payload (e.g. approval type, issue identifier) */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    /** When this notification was re-escalated */
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    escalationCount: integer("escalation_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUserReadIdx: index("notifications_company_user_read_idx").on(
      table.companyId,
      table.userId,
      table.readAt,
    ),
    entityIdx: index("notifications_entity_idx").on(table.entityType, table.entityId),
    escalationIdx: index("notifications_escalation_idx").on(
      table.companyId,
      table.severity,
      table.readAt,
      table.escalationCount,
    ),
  }),
);
