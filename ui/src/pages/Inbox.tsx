import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { approvalsApi } from "../api/approvals";
import { accessApi } from "../api/access";
import { ApiError } from "../api/client";
import { dashboardApi } from "../api/dashboard";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { createIssueDetailLocationState } from "../lib/issueDetailBreadcrumb";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { SwipeToArchive } from "../components/SwipeToArchive";
import { InboxItemRow } from "../components/InboxItemRow";
import { CategoryBadge } from "../components/CategoryBadge";
import { InboxProjectsView } from "../components/InboxProjectsView";
import { computeAlertUnreadState, type AlertUnreadState } from "../components/AlertRow";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs } from "@/components/ui/tabs";
import {
  Inbox as InboxIcon,
  AlertTriangle,
  Folder,
  Group,
  X,
} from "lucide-react";
import { PageTabBar } from "../components/PageTabBar";
import type { Agent, Approval, HeartbeatRun, Issue, JoinRequest, Project } from "@paperclipai/shared";
import {
  ACTIONABLE_APPROVAL_STATUSES,
  getApprovalsForTab,
  getInboxWorkItems,
  getLatestFailedRunsByAgent,
  getRecentTouchedIssues,
  resolveItemContext,
  categorizeWorkItem,
  saveLastInboxTab,
  shouldShowInboxSection,
  type InboxItemCategory,
  type InboxTab,
  type InboxWorkItem,
} from "../lib/inbox";
import { useDismissedInboxItems, useReadInboxItems } from "../hooks/useInboxBadge";

type CategoryFilter = "tutto" | InboxItemCategory;

const INBOX_ISSUE_STATUSES = "backlog,todo,in_progress,in_review,blocked,done";

function readIssueIdFromRun(run: HeartbeatRun): string | null {
  const context = run.contextSnapshot;
  if (!context) return null;
  const issueId = context["issueId"];
  if (typeof issueId === "string" && issueId.length > 0) return issueId;
  const taskId = context["taskId"];
  if (typeof taskId === "string" && taskId.length > 0) return taskId;
  return null;
}

type NonIssueUnreadState = "visible" | "fading" | "hidden" | null;

export function Inbox() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  // Read initial category from URL query param (e.g. /inbox/all?category=richiesta)
  const urlCategory = new URLSearchParams(location.search).get("category") as CategoryFilter | null;
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(
    urlCategory && ["richiesta", "messaggio", "aggiornamento"].includes(urlCategory) ? urlCategory : "tutto",
  );
  const [groupByAgent, setGroupByAgent] = useState(false);
  const [groupByProject, setGroupByProject] = useState(false);
  const { dismissed, dismiss } = useDismissedInboxItems();
  const { readItems, markRead: markItemRead } = useReadInboxItems();

  const pathSegment = location.pathname.split("/").pop() ?? "projects";
  const tab: InboxTab =
    pathSegment === "projects" ||
    pathSegment === "mine" ||
    pathSegment === "recent" ||
    pathSegment === "all" ||
    pathSegment === "unread"
      ? pathSegment
      : "projects";
  const issueLinkState = useMemo(
    () =>
      createIssueDetailLocationState(
        "Inbox",
        `${location.pathname}${location.search}${location.hash}`,
      ),
    [location.pathname, location.search, location.hash],
  );

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: t("inbox.title") }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    saveLastInboxTab(tab);
  }, [tab]);

  const {
    data: approvals,
    isLoading: isApprovalsLoading,
    error: approvalsError,
  } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!),
    queryFn: () => approvalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const {
    data: joinRequests = [],
    isLoading: isJoinRequestsLoading,
  } = useQuery({
    queryKey: queryKeys.access.joinRequests(selectedCompanyId!),
    queryFn: async () => {
      try {
        return await accessApi.listJoinRequests(selectedCompanyId!, "pending_approval");
      } catch (err) {
        if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
          return [];
        }
        throw err;
      }
    },
    enabled: !!selectedCompanyId,
    retry: false,
  });

  const { data: dashboard, isLoading: isDashboardLoading } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues, isLoading: isIssuesLoading } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const {
    data: mineIssuesRaw = [],
    isLoading: isMineIssuesLoading,
  } = useQuery({
    queryKey: queryKeys.issues.listMineByMe(selectedCompanyId!),
    queryFn: () =>
      issuesApi.list(selectedCompanyId!, {
        touchedByUserId: "me",
        inboxArchivedByUserId: "me",
        status: INBOX_ISSUE_STATUSES,
      }),
    enabled: !!selectedCompanyId,
  });
  const {
    data: touchedIssuesRaw = [],
    isLoading: isTouchedIssuesLoading,
  } = useQuery({
    queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId!),
    queryFn: () =>
      issuesApi.list(selectedCompanyId!, {
        touchedByUserId: "me",
        status: INBOX_ISSUE_STATUSES,
      }),
    enabled: !!selectedCompanyId,
  });

  const { data: heartbeatRuns, isLoading: isRunsLoading } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // ── Derived data ───────────────────────────────────────────────────

  const mineIssues = useMemo(() => getRecentTouchedIssues(mineIssuesRaw), [mineIssuesRaw]);
  const touchedIssues = useMemo(() => getRecentTouchedIssues(touchedIssuesRaw), [touchedIssuesRaw]);
  const unreadTouchedIssues = useMemo(
    () => touchedIssues.filter((issue) => issue.isUnreadForMe),
    [touchedIssues],
  );
  const issuesToRender = useMemo(() => {
    if (tab === "mine") return mineIssues;
    if (tab === "unread") return unreadTouchedIssues;
    // "recent", "all", "projects" all share the broader touchedIssues pool.
    return touchedIssues;
  }, [tab, mineIssues, touchedIssues, unreadTouchedIssues]);

  const agentById = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const agent of agents ?? []) map.set(agent.id, agent);
    return map;
  }, [agents]);

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues ?? []) map.set(issue.id, issue);
    return map;
  }, [issues]);

  const projectById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const project of projects ?? []) map.set(project.id, project);
    return map;
  }, [projects]);

  const failedRuns = useMemo(
    () => getLatestFailedRunsByAgent(heartbeatRuns ?? []).filter((r) => !dismissed.has(`run:${r.id}`)),
    [heartbeatRuns, dismissed],
  );

  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of heartbeatRuns ?? []) {
      if (run.status !== "running" && run.status !== "queued") continue;
      const issueId = readIssueIdFromRun(run);
      if (issueId) ids.add(issueId);
    }
    return ids;
  }, [heartbeatRuns]);

  const approvalsToRender = useMemo(() => {
    let filtered = getApprovalsForTab(approvals ?? [], tab, "all");
    if (tab === "mine") {
      filtered = filtered.filter((a) => !dismissed.has(`approval:${a.id}`));
    }
    return filtered;
  }, [approvals, tab, dismissed]);

  const joinRequestsForTab = useMemo(() => {
    if (tab === "mine") return joinRequests.filter((jr) => !dismissed.has(`join:${jr.id}`));
    return joinRequests;
  }, [joinRequests, tab, dismissed]);

  // ── Build work items + filter by category ──────────────────────────

  const allWorkItems = useMemo(
    () =>
      getInboxWorkItems({
        issues: issuesToRender,
        approvals: approvalsToRender,
        failedRuns,
        joinRequests: joinRequestsForTab,
      }),
    [approvalsToRender, issuesToRender, failedRuns, joinRequestsForTab],
  );

  const workItemsToRender = useMemo(() => {
    if (categoryFilter === "tutto") return allWorkItems;
    return allWorkItems.filter((item) => categorizeWorkItem(item) === categoryFilter);
  }, [allWorkItems, categoryFilter]);

  // Category counts for filter badges
  const categoryCounts = useMemo(() => {
    const counts = { richiesta: 0, messaggio: 0, aggiornamento: 0 };
    for (const item of allWorkItems) {
      counts[categorizeWorkItem(item)]++;
    }
    return counts;
  }, [allWorkItems]);

  // Group work items by agent or project
  type GroupedItems = { groupLabel: string; items: InboxWorkItem[] }[];

  const groupedWorkItems = useMemo((): GroupedItems | null => {
    if (!groupByAgent && !groupByProject) return null;

    const groups = new Map<string, InboxWorkItem[]>();
    for (const item of workItemsToRender) {
      const ctx = resolveItemContext(item, agentById, issueById, projectById);
      const label = groupByProject
        ? (ctx.projectName ?? "Senza progetto")
        : (ctx.agentName ?? "Altro");
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(item);
    }
    return Array.from(groups.entries()).map(([groupLabel, items]) => ({
      groupLabel,
      items,
    }));
  }, [groupByAgent, groupByProject, workItemsToRender, agentById, issueById, projectById]);

  // ── Mutations ──────────────────────────────────────────────────────

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: (_approval, id) => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(`/approvals/${id}?resolved=approved`);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to approve");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reject");
    },
  });

  const approveJoinMutation = useMutation({
    mutationFn: (joinRequest: JoinRequest) =>
      accessApi.approveJoinRequest(selectedCompanyId!, joinRequest.id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to approve join request");
    },
  });

  const rejectJoinMutation = useMutation({
    mutationFn: (joinRequest: JoinRequest) =>
      accessApi.rejectJoinRequest(selectedCompanyId!, joinRequest.id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reject join request");
    },
  });

  const [retryingRunIds, setRetryingRunIds] = useState<Set<string>>(new Set());

  const retryRunMutation = useMutation({
    mutationFn: async (run: HeartbeatRun) => {
      const payload: Record<string, unknown> = {};
      const context = run.contextSnapshot as Record<string, unknown> | null;
      if (context) {
        if (typeof context.issueId === "string" && context.issueId) payload.issueId = context.issueId;
        if (typeof context.taskId === "string" && context.taskId) payload.taskId = context.taskId;
        if (typeof context.taskKey === "string" && context.taskKey) payload.taskKey = context.taskKey;
      }
      const result = await agentsApi.wakeup(run.agentId, {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "retry_failed_run",
        payload,
      });
      if (!("id" in result)) {
        throw new Error("Retry was skipped because the agent is not currently invokable.");
      }
      return { newRun: result, originalRun: run };
    },
    onMutate: (run) => {
      setRetryingRunIds((prev) => new Set(prev).add(run.id));
    },
    onSuccess: ({ newRun, originalRun }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(originalRun.companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(originalRun.companyId, originalRun.agentId) });
      navigate(`/agents/${originalRun.agentId}/runs/${newRun.id}`);
    },
    onSettled: (_data, _error, run) => {
      if (!run) return;
      setRetryingRunIds((prev) => {
        const next = new Set(prev);
        next.delete(run.id);
        return next;
      });
    },
  });

  const [fadingOutIssues, setFadingOutIssues] = useState<Set<string>>(new Set());
  const [archivingIssueIds, setArchivingIssueIds] = useState<Set<string>>(new Set());
  const [fadingNonIssueItems, setFadingNonIssueItems] = useState<Set<string>>(new Set());
  const [archivingNonIssueIds, setArchivingNonIssueIds] = useState<Set<string>>(new Set());

  const invalidateInboxIssueQueries = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.listMineByMe(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.listUnreadTouchedByMe(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId) });
  };

  const archiveIssueMutation = useMutation({
    mutationFn: (id: string) => issuesApi.archiveFromInbox(id),
    onMutate: (id) => {
      setActionError(null);
      setArchivingIssueIds((prev) => new Set(prev).add(id));
    },
    onSuccess: () => invalidateInboxIssueQueries(),
    onError: (err, id) => {
      setActionError(err instanceof Error ? err.message : "Failed to archive issue");
      setArchivingIssueIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    onSettled: (_data, error, id) => {
      if (error) return;
      window.setTimeout(() => {
        setArchivingIssueIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 500);
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => issuesApi.markRead(id),
    onMutate: (id) => {
      setFadingOutIssues((prev) => new Set(prev).add(id));
    },
    onSuccess: () => invalidateInboxIssueQueries(),
    onSettled: (_data, _error, id) => {
      setTimeout(() => {
        setFadingOutIssues((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 300);
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async (issueIds: string[]) => {
      await Promise.all(issueIds.map((issueId) => issuesApi.markRead(issueId)));
    },
    onMutate: (issueIds) => {
      setFadingOutIssues((prev) => {
        const next = new Set(prev);
        for (const issueId of issueIds) next.add(issueId);
        return next;
      });
    },
    onSuccess: () => invalidateInboxIssueQueries(),
    onSettled: (_data, _error, issueIds) => {
      setTimeout(() => {
        setFadingOutIssues((prev) => {
          const next = new Set(prev);
          for (const issueId of issueIds) next.delete(issueId);
          return next;
        });
      }, 300);
    },
  });

  const handleMarkNonIssueRead = (key: string) => {
    setFadingNonIssueItems((prev) => new Set(prev).add(key));
    markItemRead(key);
    setTimeout(() => {
      setFadingNonIssueItems((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 300);
  };

  const handleArchiveNonIssue = (key: string) => {
    setArchivingNonIssueIds((prev) => new Set(prev).add(key));
    setTimeout(() => {
      dismiss(key);
      setArchivingNonIssueIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 200);
  };

  const nonIssueUnreadState = (key: string): NonIssueUnreadState => {
    if (tab !== "mine") return null;
    const isRead = readItems.has(key);
    const isFading = fadingNonIssueItems.has(key);
    if (isFading) return "fading";
    if (!isRead) return "visible";
    return "hidden";
  };

  // ── Guards ─────────────────────────────────────────────────────────

  if (!selectedCompanyId) {
    return <EmptyState icon={InboxIcon} message={t("inbox.selectCompany")} />;
  }

  const hasRunFailures = failedRuns.length > 0;
  const showAggregateAgentError = !!dashboard && dashboard.agents.error > 0 && !hasRunFailures && !dismissed.has("alert:agent-errors");
  const showBudgetAlert =
    !!dashboard &&
    dashboard.costs.monthBudgetCents > 0 &&
    dashboard.costs.monthUtilizationPercent >= 80 &&
    !dismissed.has("alert:budget");
  const hasAlerts = showAggregateAgentError || showBudgetAlert;
  const showAlertsSection = shouldShowInboxSection({
    tab,
    hasItems: hasAlerts,
    showOnMine: hasAlerts,
    showOnRecent: hasAlerts,
    showOnUnread: hasAlerts,
    showOnAll: hasAlerts,
  });

  const allLoaded =
    !isJoinRequestsLoading &&
    !isApprovalsLoading &&
    !isDashboardLoading &&
    !isIssuesLoading &&
    !isMineIssuesLoading &&
    !isTouchedIssuesLoading &&
    !isRunsLoading;

  const markAllReadIssues = (tab === "mine" ? mineIssues : unreadTouchedIssues)
    .filter((issue) => issue.isUnreadForMe && !fadingOutIssues.has(issue.id) && !archivingIssueIds.has(issue.id));
  const canMarkAllRead = markAllReadIssues.length > 0;

  const isMineTab = tab === "mine";

  // ── Render helpers ─────────────────────────────────────────────────

  function renderItem(item: InboxWorkItem) {
    const ctx = resolveItemContext(item, agentById, issueById, projectById);

    if (item.kind === "issue") {
      const { issue } = item;
      const isUnread = issue.isUnreadForMe && !fadingOutIssues.has(issue.id);
      const isFading = fadingOutIssues.has(issue.id);
      const isArchiving = archivingIssueIds.has(issue.id);
      const row = (
        <InboxItemRow
          key={`issue:${issue.id}`}
          item={item}
          context={ctx}
          issueLinkState={issueLinkState}
          issueById={issueById}
          unreadState={isUnread ? "visible" : isFading ? "fading" : "hidden"}
          onMarkRead={() => markReadMutation.mutate(issue.id)}
          onArchive={isMineTab ? () => archiveIssueMutation.mutate(issue.id) : undefined}
          archiveDisabled={isArchiving || archiveIssueMutation.isPending}
          className={
            isArchiving
              ? "pointer-events-none -translate-x-4 scale-[0.98] opacity-0 transition-all duration-200 ease-out"
              : "transition-all duration-200 ease-out"
          }
        />
      );
      return isMineTab ? (
        <SwipeToArchive
          key={`issue:${issue.id}`}
          disabled={isArchiving || archiveIssueMutation.isPending}
          onArchive={() => archiveIssueMutation.mutate(issue.id)}
        >
          {row}
        </SwipeToArchive>
      ) : row;
    }

    if (item.kind === "approval") {
      const approvalKey = `approval:${item.approval.id}`;
      const isArchiving = archivingNonIssueIds.has(approvalKey);
      const row = (
        <InboxItemRow
          key={approvalKey}
          item={item}
          context={ctx}
          onApprove={() => approveMutation.mutate(item.approval.id)}
          onReject={() => rejectMutation.mutate(item.approval.id)}
          isPending={approveMutation.isPending || rejectMutation.isPending}
          unreadState={nonIssueUnreadState(approvalKey)}
          onMarkRead={() => handleMarkNonIssueRead(approvalKey)}
          onArchive={isMineTab ? () => handleArchiveNonIssue(approvalKey) : undefined}
          archiveDisabled={isArchiving}
          className={
            isArchiving
              ? "pointer-events-none -translate-x-4 scale-[0.98] opacity-0 transition-all duration-200 ease-out"
              : "transition-all duration-200 ease-out"
          }
        />
      );
      return isMineTab ? (
        <SwipeToArchive key={approvalKey} disabled={isArchiving} onArchive={() => handleArchiveNonIssue(approvalKey)}>
          {row}
        </SwipeToArchive>
      ) : row;
    }

    if (item.kind === "failed_run") {
      const runKey = `run:${item.run.id}`;
      const isArchiving = archivingNonIssueIds.has(runKey);
      const row = (
        <InboxItemRow
          key={runKey}
          item={item}
          context={ctx}
          issueById={issueById}
          onDismiss={() => dismiss(runKey)}
          onRetry={() => retryRunMutation.mutate(item.run)}
          isRetrying={retryingRunIds.has(item.run.id)}
          unreadState={nonIssueUnreadState(runKey)}
          onMarkRead={() => handleMarkNonIssueRead(runKey)}
          onArchive={isMineTab ? () => handleArchiveNonIssue(runKey) : undefined}
          archiveDisabled={isArchiving}
          className={
            isArchiving
              ? "pointer-events-none -translate-x-4 scale-[0.98] opacity-0 transition-all duration-200 ease-out"
              : "transition-all duration-200 ease-out"
          }
        />
      );
      return isMineTab ? (
        <SwipeToArchive key={runKey} disabled={isArchiving} onArchive={() => handleArchiveNonIssue(runKey)}>
          {row}
        </SwipeToArchive>
      ) : row;
    }

    if (item.kind === "join_request") {
      const joinKey = `join:${item.joinRequest.id}`;
      const isArchiving = archivingNonIssueIds.has(joinKey);
      const row = (
        <InboxItemRow
          key={joinKey}
          item={item}
          context={ctx}
          onApprove={() => approveJoinMutation.mutate(item.joinRequest)}
          onReject={() => rejectJoinMutation.mutate(item.joinRequest)}
          isPending={approveJoinMutation.isPending || rejectJoinMutation.isPending}
          unreadState={nonIssueUnreadState(joinKey)}
          onMarkRead={() => handleMarkNonIssueRead(joinKey)}
          onArchive={isMineTab ? () => handleArchiveNonIssue(joinKey) : undefined}
          archiveDisabled={isArchiving}
          className={
            isArchiving
              ? "pointer-events-none -translate-x-4 scale-[0.98] opacity-0 transition-all duration-200 ease-out"
              : "transition-all duration-200 ease-out"
          }
        />
      );
      return isMineTab ? (
        <SwipeToArchive key={joinKey} disabled={isArchiving} onArchive={() => handleArchiveNonIssue(joinKey)}>
          {row}
        </SwipeToArchive>
      ) : row;
    }

    return null;
  }

  // ── Projects view helpers ─────────────────────────────────────────

  const keyForItem = (item: InboxWorkItem): string => {
    if (item.kind === "issue") return `issue:${item.issue.id}`;
    if (item.kind === "approval") return `approval:${item.approval.id}`;
    if (item.kind === "failed_run") return `run:${item.run.id}`;
    return `join:${item.joinRequest.id}`;
  };

  // The "unread" semantics for the projects view: if it's a read non-issue item,
  // or an issue we've already marked read, treat as "read". Otherwise defer to
  // the generic computeAlertUnreadState helper which handles actionable vs new.
  const computeProjectsUnreadState = (item: InboxWorkItem): AlertUnreadState => {
    const readKeys = new Set<string>();
    for (const k of readItems) readKeys.add(k);
    // Issues track their own isUnreadForMe bit; if we've locally faded them
    // we still want them to appear "read" in the projects card.
    if (item.kind === "issue" && (fadingOutIssues.has(item.issue.id) || !item.issue.isUnreadForMe)) {
      return "read";
    }
    return computeAlertUnreadState(item, readKeys, keyForItem);
  };

  const buildProjectsItemHandlers = (item: InboxWorkItem) => {
    if (item.kind === "issue") {
      const issuePathId = item.issue.identifier ?? item.issue.id;
      return {
        fallbackHref: `/issues/${issuePathId}`,
        onArchive: () => archiveIssueMutation.mutate(item.issue.id),
        onSuspend: () => {
          /* S42 — stub */
        },
      };
    }
    if (item.kind === "approval") {
      const approvalKey = `approval:${item.approval.id}`;
      return {
        fallbackHref: `/approvals/${item.approval.id}`,
        onApprove: () => approveMutation.mutate(item.approval.id),
        onArchive: () => handleArchiveNonIssue(approvalKey),
        isPending: approveMutation.isPending || rejectMutation.isPending,
        onSuspend: () => {
          /* S42 */
        },
      };
    }
    if (item.kind === "failed_run") {
      const runKey = `run:${item.run.id}`;
      return {
        fallbackHref: `/agents/${item.run.agentId}/runs/${item.run.id}`,
        onRetry: () => retryRunMutation.mutate(item.run),
        onArchive: () => handleArchiveNonIssue(runKey),
        isRetrying: retryingRunIds.has(item.run.id),
      };
    }
    // join_request — no direct detail route, fallback undefined
    const joinKey = `join:${item.joinRequest.id}`;
    return {
      onApprove: () => approveJoinMutation.mutate(item.joinRequest),
      onArchive: () => handleArchiveNonIssue(joinKey),
      isPending: approveJoinMutation.isPending || rejectJoinMutation.isPending,
    };
  };

  // ── Main render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Tab bar + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={tab} onValueChange={(value) => navigate(`/inbox/${value}`)}>
            <PageTabBar
              items={[
                {
                  value: "projects",
                  label: (() => {
                    const unreadCount = allWorkItems.filter(
                      (it) => computeProjectsUnreadState(it) !== "read",
                    ).length;
                    return (
                      <span className="inline-flex items-center gap-1.5">
                        {t("inbox.projects")}
                        {unreadCount > 0 && (
                          <span className="inline-flex min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </span>
                    );
                  })(),
                },
                { value: "mine", label: t("inbox.mine") },
                { value: "recent", label: t("inbox.recent") },
                { value: "unread", label: t("inbox.unread") },
                { value: "all", label: t("inbox.all") },
              ]}
            />
          </Tabs>

          {tab !== "projects" && canMarkAllRead && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => markAllReadMutation.mutate(markAllReadIssues.map((i) => i.id))}
              disabled={markAllReadMutation.isPending}
            >
              {markAllReadMutation.isPending ? t("inbox.marking") : t("inbox.markAllRead")}
            </Button>
          )}
          {tab !== "projects" && (
            <>
              <Button
                type="button"
                variant={groupByAgent ? "default" : "outline"}
                size="sm"
                className="h-8 shrink-0 gap-1.5"
                onClick={() => { setGroupByAgent((p) => !p); setGroupByProject(false); }}
              >
                <Group className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{groupByAgent ? t("inbox.grouped") : t("inbox.groupByAgent")}</span>
              </Button>
              <Button
                type="button"
                variant={groupByProject ? "default" : "outline"}
                size="sm"
                className="h-8 shrink-0 gap-1.5"
                onClick={() => { setGroupByProject((p) => !p); setGroupByAgent(false); }}
              >
                <Folder className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{groupByProject ? "Raggruppati" : "Per progetto"}</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Category filter pills (legacy views only — the projects view has its own toolbar) */}
      {tab !== "projects" && (
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCategoryFilter("tutto")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            categoryFilter === "tutto"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent",
          )}
        >
          Tutto ({allWorkItems.length})
        </button>
        {(["richiesta", "messaggio", "aggiornamento"] as InboxItemCategory[]).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat === categoryFilter ? "tutto" : cat)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1.5",
              categoryFilter === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent",
            )}
          >
            <CategoryBadge
              category={cat}
              className={cn(
                "!px-0 !py-0 !bg-transparent !text-inherit !text-[10px]",
                categoryFilter === cat && "!text-primary-foreground",
              )}
            />
            <span>({categoryCounts[cat]})</span>
          </button>
        ))}
      </div>
      )}

      {/* Projects view (default) */}
      {tab === "projects" && (
        <InboxProjectsView
          allWorkItems={allWorkItems}
          agentById={agentById}
          issueById={issueById}
          projectById={projectById}
          projects={projects ?? []}
          computeUnreadState={computeProjectsUnreadState}
          buildItemHandlers={buildProjectsItemHandlers}
        />
      )}

      {approvalsError && <p className="text-sm text-destructive">{approvalsError.message}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {tab !== "projects" && !allLoaded && workItemsToRender.length === 0 && !showAlertsSection && (
        <PageSkeleton variant="inbox" />
      )}

      {tab !== "projects" && allLoaded && workItemsToRender.length === 0 && !showAlertsSection && (
        <EmptyState
          icon={InboxIcon}
          message={
            categoryFilter !== "tutto"
              ? `Nessun elemento nella categoria "${categoryFilter}"`
              : tab === "mine"
              ? t("inbox.noItems")
              : tab === "unread"
              ? t("inbox.noNewItems")
              : tab === "recent"
                ? t("inbox.noRecentItems")
                : t("inbox.noMatchingItems")
          }
        />
      )}

      {/* Work items (legacy views) */}
      {tab !== "projects" && workItemsToRender.length > 0 && (
        <div className="space-y-4">
          {(groupedWorkItems ?? [{ groupLabel: null, items: workItemsToRender }]).map((group) => (
            <div key={group.groupLabel ?? "all"}>
              {group.groupLabel && (
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {group.groupLabel.charAt(0).toUpperCase()}
                  </span>
                  {group.groupLabel}
                  <span className="text-xs font-normal text-muted-foreground">({group.items.length})</span>
                </h3>
              )}
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {group.items.map(renderItem)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alerts section */}
      {showAlertsSection && (
        <>
          <Separator />
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Alerts
            </h3>
            <div className="divide-y divide-border rounded-xl border border-border">
              {showAggregateAgentError && (
                <div className="group/alert relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
                  <Link
                    to="/agents"
                    className="flex flex-1 cursor-pointer items-center gap-3 no-underline text-inherit"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span className="text-sm">
                      <span className="font-medium">{dashboard!.agents.error}</span>{" "}
                      {dashboard!.agents.error === 1 ? "agent has" : "agents have"} errors
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => dismiss("alert:agent-errors")}
                    className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/alert:opacity-100"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {showBudgetAlert && (
                <div className="group/alert relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
                  <Link
                    to="/costs"
                    className="flex flex-1 cursor-pointer items-center gap-3 no-underline text-inherit"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400" />
                    <span className="text-sm">
                      Budget at{" "}
                      <span className="font-medium">{dashboard!.costs.monthUtilizationPercent}%</span>{" "}
                      utilization this month
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => dismiss("alert:budget")}
                    className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/alert:opacity-100"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
