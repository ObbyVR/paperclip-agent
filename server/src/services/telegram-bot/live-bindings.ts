// S43 — Telegram CEO Bot — live (production) service bindings
//
// Adapts real paperclip services (via drizzle `db`) to the narrow `BotServices`
// interface consumed by command handlers. This is the ONLY file that imports
// the concrete `services/*` modules; everything else stays service-agnostic
// for easy unit testing.

import type { Db } from "@paperclipai/db";
import { agentService } from "../agents.js";
import { approvalService } from "../approvals.js";
import { companyService } from "../companies.js";
import { dashboardService } from "../dashboard.js";
import { issueService } from "../issues.js";
import { heartbeatService } from "../heartbeat.js";
import { logActivity } from "../activity-log.js";
import { queueIssueAssignmentWakeup } from "../issue-assignment-wakeup.js";
import type {
  BotAgent,
  BotApproval,
  BotCompany,
  BotDashboardSummary,
  BotIssueDetail,
  BotIssueSummary,
  BotServices,
} from "./service-bindings.js";

export function createLiveBindings(db: Db): BotServices {
  const companies = companyService(db);
  const agents = agentService(db);
  const issues = issueService(db);
  const approvals = approvalService(db);
  const dashboard = dashboardService(db);
  const heartbeat = heartbeatService(db);

  const mapCompany = (c: { id: string; name: string; issuePrefix: string }): BotCompany => ({
    id: c.id,
    name: c.name,
    issuePrefix: c.issuePrefix,
  });

  const mapAgent = (a: {
    id: string;
    name: string;
    role: string;
    status: string;
    title: string | null;
  }): BotAgent => ({
    id: a.id,
    name: a.name,
    role: a.role,
    status: a.status,
    title: a.title,
  });

  const mapIssueSummary = (i: {
    id: string;
    identifier: string;
    title: string;
    status: string;
    assigneeAgentId: string | null;
    updatedAt: Date | string;
  }): BotIssueSummary => ({
    id: i.id,
    identifier: i.identifier,
    title: i.title,
    status: i.status,
    assigneeAgentId: i.assigneeAgentId,
    updatedAt: i.updatedAt,
  });

  const mapIssueDetail = (i: {
    id: string;
    identifier: string;
    title: string;
    status: string;
    description: string | null;
    assigneeAgentId: string | null;
    updatedAt: Date | string;
    createdAt: Date | string;
  }): BotIssueDetail => ({
    ...mapIssueSummary(i),
    description: i.description,
    createdAt: i.createdAt,
  });

  const mapApproval = (a: {
    id: string;
    type: string;
    status: string;
    payload: unknown;
    createdAt: Date | string;
  }): BotApproval => ({
    id: a.id,
    type: a.type,
    status: a.status,
    payload: (a.payload as Record<string, unknown>) ?? {},
    createdAt: a.createdAt,
  });

  return {
    async listCompanies() {
      const rows = await companies.list();
      return rows.map(mapCompany);
    },
    async getCompany(id) {
      const row = await companies.getById(id);
      return row ? mapCompany(row) : null;
    },

    async listAgents(companyId) {
      const rows = await agents.list(companyId);
      return rows.map((r) =>
        mapAgent({
          id: r.id,
          name: r.name,
          role: r.role,
          status: r.status,
          title: (r as { title?: string | null }).title ?? null,
        }),
      );
    },
    async getAgent(agentId) {
      const row = await agents.getById(agentId);
      if (!row) return null;
      return mapAgent({
        id: row.id,
        name: row.name,
        role: row.role,
        status: row.status,
        title: (row as { title?: string | null }).title ?? null,
      });
    },

    async listActiveIssues(companyId, limit = 10) {
      const rows = await issues.list(companyId, { status: "in_progress,open,blocked" });
      return rows.slice(0, limit).map((r) =>
        mapIssueSummary({
          id: r.id,
          identifier: r.identifier ?? "?",
          title: r.title,
          status: r.status,
          assigneeAgentId: r.assigneeAgentId ?? null,
          updatedAt: r.updatedAt,
        }),
      );
    },
    async getIssueByIdentifier(companyId, identifier) {
      const row = await issues.getByIdentifier(identifier);
      if (!row || row.companyId !== companyId) return null;
      return mapIssueDetail({
        id: row.id,
        identifier: row.identifier ?? identifier,
        title: row.title,
        status: row.status,
        description: row.description ?? null,
        assigneeAgentId: row.assigneeAgentId ?? null,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
      });
    },
    async createIssue(input) {
      // The service's inferInsert type has many optional fields; we only set
      // the essentials. Cast via unknown to sidestep the wide inferred shape.
      const row = await issues.create(input.companyId, {
        title: input.title,
        description: input.description,
        status: "open",
        assigneeAgentId: input.assigneeAgentId,
        originKind: "manual",
      } as unknown as Parameters<typeof issues.create>[1]);

      // Replicate what routes/issues.ts does on POST /issues: log the
      // activity entry so the Inbox/Activity feed shows the new issue, then
      // queue the assignee wake-up so Paperclip's existing scheduler picks
      // up the work. We pass ourselves as `actor = {type: "user", id:
      // <allowlist userId>}` via the params — same shape routes use. All of
      // this is fire-and-forget: a failure does NOT undo the insert.
      void logActivity(db, {
        companyId: input.companyId,
        actorType: "user",
        actorId: input.createdByUserId,
        action: "issue.created",
        entityType: "issue",
        entityId: row.id,
        details: { title: row.title, identifier: row.identifier, source: "telegram-bot" },
      }).catch(() => void 0);

      void queueIssueAssignmentWakeup({
        heartbeat,
        issue: { id: row.id, assigneeAgentId: row.assigneeAgentId, status: row.status },
        reason: "issue_assigned",
        mutation: "create",
        contextSource: "telegram-bot.createIssue",
        requestedByActorType: "user",
        requestedByActorId: input.createdByUserId,
      });

      return mapIssueSummary({
        id: row.id,
        identifier: row.identifier ?? "?",
        title: row.title,
        status: row.status,
        assigneeAgentId: row.assigneeAgentId ?? null,
        updatedAt: row.updatedAt,
      });
    },

    async listPendingApprovals(companyId) {
      const rows = await approvals.list(companyId, "pending");
      return rows.map(mapApproval);
    },
    async approveApproval(id, userId, note) {
      const { approval } = await approvals.approve(id, userId, note);
      return mapApproval(approval);
    },
    async rejectApproval(id, userId, note) {
      const { approval } = await approvals.reject(id, userId, note);
      return mapApproval(approval);
    },

    async dashboardSummary(companyId): Promise<BotDashboardSummary> {
      const s = await dashboard.summary(companyId);
      // `tasks` is typed as Record<string, number> by the service even though
      // the runtime always includes these 4 keys; narrow them explicitly.
      const tasks = s.tasks as Record<string, number | undefined>;
      return {
        agents: s.agents,
        tasks: {
          open: tasks.open ?? 0,
          inProgress: tasks.inProgress ?? 0,
          blocked: tasks.blocked ?? 0,
          done: tasks.done ?? 0,
        },
        costs: s.costs,
        pendingApprovals: s.pendingApprovals,
      };
    },
  };
}
