import type {
  Agent,
  Approval,
  DashboardSummary,
  HeartbeatRun,
  Issue,
  JoinRequest,
  Project,
} from "@paperclipai/shared";

export const RECENT_ISSUES_LIMIT = 100;
export const FAILED_RUN_STATUSES = new Set(["failed", "timed_out"]);
export const ACTIONABLE_APPROVAL_STATUSES = new Set(["pending", "revision_requested"]);
export const DISMISSED_KEY = "paperclip:inbox:dismissed";
export const READ_ITEMS_KEY = "paperclip:inbox:read-items";
export const INBOX_LAST_TAB_KEY = "paperclip:inbox:last-tab";
export type InboxTab = "mine" | "recent" | "unread" | "all";
export type InboxApprovalFilter = "all" | "actionable" | "resolved";
export type InboxWorkItem =
  | {
      kind: "issue";
      timestamp: number;
      issue: Issue;
    }
  | {
      kind: "approval";
      timestamp: number;
      approval: Approval;
    }
  | {
      kind: "failed_run";
      timestamp: number;
      run: HeartbeatRun;
    }
  | {
      kind: "join_request";
      timestamp: number;
      joinRequest: JoinRequest;
    };

export interface InboxBadgeData {
  inbox: number;
  approvals: number;
  failedRuns: number;
  joinRequests: number;
  mineIssues: number;
  alerts: number;
}

export function loadDismissedInboxItems(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveDismissedInboxItems(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore localStorage failures.
  }
}

export function loadReadInboxItems(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_ITEMS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveReadInboxItems(ids: Set<string>) {
  try {
    localStorage.setItem(READ_ITEMS_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore localStorage failures.
  }
}

export function loadLastInboxTab(): InboxTab {
  try {
    const raw = localStorage.getItem(INBOX_LAST_TAB_KEY);
    if (raw === "all" || raw === "unread" || raw === "recent" || raw === "mine") return raw;
    if (raw === "new") return "mine";
    return "mine";
  } catch {
    return "mine";
  }
}

export function saveLastInboxTab(tab: InboxTab) {
  try {
    localStorage.setItem(INBOX_LAST_TAB_KEY, tab);
  } catch {
    // Ignore localStorage failures.
  }
}

export function getLatestFailedRunsByAgent(runs: HeartbeatRun[]): HeartbeatRun[] {
  const sorted = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const latestByAgent = new Map<string, HeartbeatRun>();

  for (const run of sorted) {
    if (!latestByAgent.has(run.agentId)) {
      latestByAgent.set(run.agentId, run);
    }
  }

  return Array.from(latestByAgent.values()).filter((run) => FAILED_RUN_STATUSES.has(run.status));
}

export function normalizeTimestamp(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function issueLastActivityTimestamp(issue: Issue): number {
  const lastExternalCommentAt = normalizeTimestamp(issue.lastExternalCommentAt);
  if (lastExternalCommentAt > 0) return lastExternalCommentAt;

  const updatedAt = normalizeTimestamp(issue.updatedAt);
  const myLastTouchAt = normalizeTimestamp(issue.myLastTouchAt);
  if (myLastTouchAt > 0 && updatedAt <= myLastTouchAt) return 0;

  return updatedAt;
}

export function sortIssuesByMostRecentActivity(a: Issue, b: Issue): number {
  const activityDiff = issueLastActivityTimestamp(b) - issueLastActivityTimestamp(a);
  if (activityDiff !== 0) return activityDiff;
  return normalizeTimestamp(b.updatedAt) - normalizeTimestamp(a.updatedAt);
}

export function getRecentTouchedIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(sortIssuesByMostRecentActivity).slice(0, RECENT_ISSUES_LIMIT);
}

export function getUnreadTouchedIssues(issues: Issue[]): Issue[] {
  return issues.filter((issue) => issue.isUnreadForMe);
}

export function getApprovalsForTab(
  approvals: Approval[],
  tab: InboxTab,
  filter: InboxApprovalFilter,
): Approval[] {
  const sortedApprovals = [...approvals].sort(
    (a, b) => normalizeTimestamp(b.updatedAt) - normalizeTimestamp(a.updatedAt),
  );

  if (tab === "mine" || tab === "recent") return sortedApprovals;
  if (tab === "unread") {
    return sortedApprovals.filter((approval) => ACTIONABLE_APPROVAL_STATUSES.has(approval.status));
  }
  if (filter === "all") return sortedApprovals;

  return sortedApprovals.filter((approval) => {
    const isActionable = ACTIONABLE_APPROVAL_STATUSES.has(approval.status);
    return filter === "actionable" ? isActionable : !isActionable;
  });
}

export function approvalActivityTimestamp(approval: Approval): number {
  const updatedAt = normalizeTimestamp(approval.updatedAt);
  if (updatedAt > 0) return updatedAt;
  return normalizeTimestamp(approval.createdAt);
}

export function getInboxWorkItems({
  issues,
  approvals,
  failedRuns = [],
  joinRequests = [],
}: {
  issues: Issue[];
  approvals: Approval[];
  failedRuns?: HeartbeatRun[];
  joinRequests?: JoinRequest[];
}): InboxWorkItem[] {
  return [
    ...issues.map((issue) => ({
      kind: "issue" as const,
      timestamp: issueLastActivityTimestamp(issue),
      issue,
    })),
    ...approvals.map((approval) => ({
      kind: "approval" as const,
      timestamp: approvalActivityTimestamp(approval),
      approval,
    })),
    ...failedRuns.map((run) => ({
      kind: "failed_run" as const,
      timestamp: normalizeTimestamp(run.createdAt),
      run,
    })),
    ...joinRequests.map((joinRequest) => ({
      kind: "join_request" as const,
      timestamp: normalizeTimestamp(joinRequest.createdAt),
      joinRequest,
    })),
  ].sort((a, b) => {
    const timestampDiff = b.timestamp - a.timestamp;
    if (timestampDiff !== 0) return timestampDiff;

    if (a.kind === "issue" && b.kind === "issue") {
      return sortIssuesByMostRecentActivity(a.issue, b.issue);
    }
    if (a.kind === "approval" && b.kind === "approval") {
      return approvalActivityTimestamp(b.approval) - approvalActivityTimestamp(a.approval);
    }

    return a.kind === "approval" ? -1 : 1;
  });
}

export function shouldShowInboxSection({
  tab,
  hasItems,
  showOnMine,
  showOnRecent,
  showOnUnread,
  showOnAll,
}: {
  tab: InboxTab;
  hasItems: boolean;
  showOnMine: boolean;
  showOnRecent: boolean;
  showOnUnread: boolean;
  showOnAll: boolean;
}): boolean {
  if (!hasItems) return false;
  if (tab === "mine") return showOnMine;
  if (tab === "recent") return showOnRecent;
  if (tab === "unread") return showOnUnread;
  return showOnAll;
}

// ── S36: Item category + context resolution ─────────────────────────

/** Item category labels for inbox display */
export type InboxItemCategory = "richiesta" | "messaggio" | "aggiornamento";

/** Resolved context for displaying an inbox item */
export interface InboxItemContext {
  category: InboxItemCategory;
  projectName: string | null;
  projectId: string | null;
  agentName: string | null;
  agentRole: string | null;
  agentIcon: string | null;
  issueIdentifier: string | null;
}

/** Classify a work item into richiesta / messaggio / aggiornamento */
export function categorizeWorkItem(item: InboxWorkItem): InboxItemCategory {
  if (item.kind === "approval") return "richiesta";
  if (item.kind === "join_request") return "richiesta";
  if (item.kind === "failed_run") return "aggiornamento";
  if (item.kind === "issue") {
    const { issue } = item;
    if (issue.status === "blocked" || issue.status === "in_review") return "richiesta";
    const lastExternal = normalizeTimestamp(issue.lastExternalCommentAt);
    const myLastTouch = normalizeTimestamp(issue.myLastTouchAt);
    if (lastExternal > 0 && lastExternal > myLastTouch) return "messaggio";
    return "aggiornamento";
  }
  return "aggiornamento";
}

/** Resolve project/agent context from any inbox work item */
export function resolveItemContext(
  item: InboxWorkItem,
  agentById: Map<string, Agent>,
  issueById: Map<string, Issue>,
  projectById?: Map<string, Project>,
): InboxItemContext {
  const category = categorizeWorkItem(item);
  let projectName: string | null = null;
  let projectId: string | null = null;
  let agentName: string | null = null;
  let agentRole: string | null = null;
  let agentIcon: string | null = null;
  let issueIdentifier: string | null = null;

  if (item.kind === "issue") {
    const { issue } = item;
    projectName = issue.project?.name ?? null;
    projectId = issue.projectId;
    // Fallback: lookup project from projectId if nested object not populated
    if (!projectName && projectId && projectById) {
      const proj = projectById.get(projectId);
      if (proj) projectName = proj.name;
    }
    issueIdentifier = issue.identifier ?? issue.id.slice(0, 8);
    if (issue.assigneeAgentId) {
      const agent = agentById.get(issue.assigneeAgentId);
      if (agent) {
        agentName = agent.name;
        agentRole = agent.title ?? agent.role;
        agentIcon = agent.icon;
      }
    }
  } else if (item.kind === "approval") {
    const { approval } = item;
    if (approval.requestedByAgentId) {
      const agent = agentById.get(approval.requestedByAgentId);
      if (agent) {
        agentName = agent.name;
        agentRole = agent.title ?? agent.role;
        agentIcon = agent.icon;
      }
    }
    // Try to resolve project from linked issue in payload
    const payloadIssueId = (approval.payload as Record<string, unknown>)?.issueId;
    if (typeof payloadIssueId === "string") {
      const issue = issueById.get(payloadIssueId);
      if (issue) {
        projectName = issue.project?.name ?? null;
        projectId = issue.projectId;
        if (!projectName && projectId && projectById) {
          const proj = projectById.get(projectId);
          if (proj) projectName = proj.name;
        }
        issueIdentifier = issue.identifier ?? issue.id.slice(0, 8);
      }
    }
  } else if (item.kind === "failed_run") {
    const { run } = item;
    const agent = agentById.get(run.agentId);
    if (agent) {
      agentName = agent.name;
      agentRole = agent.title ?? agent.role;
      agentIcon = agent.icon;
    }
    // Try to resolve project from context snapshot
    const ctx = run.contextSnapshot;
    const issueId = ctx?.issueId ?? ctx?.taskId;
    if (typeof issueId === "string") {
      const issue = issueById.get(issueId);
      if (issue) {
        projectName = issue.project?.name ?? null;
        projectId = issue.projectId;
        if (!projectName && projectId && projectById) {
          const proj = projectById.get(projectId);
          if (proj) projectName = proj.name;
        }
        issueIdentifier = issue.identifier ?? issue.id.slice(0, 8);
      }
    }
  } else if (item.kind === "join_request") {
    const { joinRequest } = item;
    agentName = joinRequest.agentName ?? null;
  }

  return { category, projectName, projectId, agentName, agentRole, agentIcon, issueIdentifier };
}

export function computeInboxBadgeData({
  approvals,
  joinRequests,
  dashboard,
  heartbeatRuns,
  mineIssues,
  dismissed,
}: {
  approvals: Approval[];
  joinRequests: JoinRequest[];
  dashboard: DashboardSummary | undefined;
  heartbeatRuns: HeartbeatRun[];
  mineIssues: Issue[];
  dismissed: Set<string>;
}): InboxBadgeData {
  const actionableApprovals = approvals.filter(
    (approval) =>
      ACTIONABLE_APPROVAL_STATUSES.has(approval.status) &&
      !dismissed.has(`approval:${approval.id}`),
  ).length;
  const failedRuns = getLatestFailedRunsByAgent(heartbeatRuns).filter(
    (run) => !dismissed.has(`run:${run.id}`),
  ).length;
  const visibleJoinRequests = joinRequests.filter(
    (jr) => !dismissed.has(`join:${jr.id}`),
  ).length;
  const visibleMineIssues = mineIssues.filter((issue) => issue.isUnreadForMe).length;
  const agentErrorCount = dashboard?.agents.error ?? 0;
  const monthBudgetCents = dashboard?.costs.monthBudgetCents ?? 0;
  const monthUtilizationPercent = dashboard?.costs.monthUtilizationPercent ?? 0;
  const showAggregateAgentError =
    agentErrorCount > 0 &&
    failedRuns === 0 &&
    !dismissed.has("alert:agent-errors");
  const showBudgetAlert =
    monthBudgetCents > 0 &&
    monthUtilizationPercent >= 80 &&
    !dismissed.has("alert:budget");
  const alerts = Number(showAggregateAgentError) + Number(showBudgetAlert);

  return {
    inbox: actionableApprovals + visibleJoinRequests + failedRuns + visibleMineIssues + alerts,
    approvals: actionableApprovals,
    failedRuns,
    joinRequests: visibleJoinRequests,
    mineIssues: visibleMineIssues,
    alerts,
  };
}
