import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
// activityApi removed — activity feed moved out of dashboard
import { approvalsApi } from "../api/approvals";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { StatusIcon } from "../components/StatusIcon";
// ActivityRow removed — activity feed moved out of dashboard
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn, formatCents } from "../lib/utils";
import { Bot, ChevronDown, CircleDot, DollarSign, LayoutDashboard, PauseCircle, Play, ShieldCheck, Square, Zap } from "lucide-react";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
// WorkflowVisualizer removed — replaced by WorkflowGraph
import { WorkflowGraph } from "../components/WorkflowGraph";
import { Component, type ErrorInfo, type ReactNode } from "react";

// Error boundary to prevent WorkflowGraph crashes from killing the whole dashboard
class WorkflowGraphErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[WorkflowGraph]", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4 text-xs text-red-400">
          Errore nel grafo workflow: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

function WorkflowGraphSafe(props: React.ComponentProps<typeof WorkflowGraph>) {
  return (
    <WorkflowGraphErrorBoundary>
      <WorkflowGraph {...props} />
    </WorkflowGraphErrorBoundary>
  );
}
import { PageSkeleton } from "../components/PageSkeleton";
import type { Agent, Issue } from "@paperclipai/shared";
import { PluginSlotOutlet } from "@/plugins/slots";

function getRecentIssues(issues: Issue[]): Issue[] {
  return [...issues]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function Dashboard() {
  const { t } = useTranslation();
  const { selectedCompanyId, companies } = useCompany();
  const { openOnboarding } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  // Activity animation state removed — feed no longer on dashboard

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: t("dashboard.title") }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Activity query removed — no longer on dashboard

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // projects query removed — no longer needed on dashboard

  const recentIssues = issues ? getRecentIssues(issues) : [];
  // Activity animation effects removed — feed no longer on dashboard

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  // entityNameMap, entityTitleMap removed — ActivityRow no longer used

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  // ── All hooks MUST be above conditional returns ──

  const { data: liveRuns } = useQuery({
    queryKey: [...queryKeys.liveRuns(selectedCompanyId ?? ""), "dashboard-wf"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!, 4),
    enabled: !!selectedCompanyId,
    refetchInterval: 60000,
  });
  const activeRuns = (liveRuns ?? []).filter((r) => r.status === "running" || r.status === "queued");

  const { data: pendingApprovalsList } = useQuery({
    queryKey: [...queryKeys.approvals.list(selectedCompanyId ?? ""), "pending"],
    queryFn: () => approvalsApi.list(selectedCompanyId!, "pending"),
    enabled: !!selectedCompanyId,
    refetchInterval: 30000,
  });

  const queryClient = useQueryClient();
  const unblockMutation = useMutation({
    mutationFn: async ({ issueId, action }: { issueId: string; action: "approve" | "reject" | "revision" }) => {
      if (action === "revision") {
        await issuesApi.addComment(issueId, "🔄 Revisione richiesta dal founder.");
        return issuesApi.update(issueId, { status: "in_progress" });
      }
      const newStatus = action === "approve" ? "done" : "cancelled";
      const comment = action === "approve" ? "✅ Approvato dal founder." : "❌ Rifiutato dal founder.";
      await issuesApi.addComment(issueId, comment);
      return issuesApi.update(issueId, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
    },
  });

  // ── All hooks MUST be above this line ──

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message={`${t("onboarding.welcome")}. ${t("onboarding.getStarted")}`}
          action={t("onboarding.startOnboarding")}
          onAction={openOnboarding}
        />
      );
    }
    return (
      <EmptyState icon={LayoutDashboard} message={t("dashboard.selectCompany")} />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const hasNoAgents = agents !== undefined && agents.length === 0;

  const handleCancelRun = async (runId: string) => {
    try { await heartbeatsApi.cancel(runId); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {hasNoAgents && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/60">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-900 dark:text-amber-100">
              {t("dashboard.noAgents")}
            </p>
          </div>
          <button
            onClick={() => openOnboarding({ initialStep: 2, companyId: selectedCompanyId! })}
            className="text-sm font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 underline underline-offset-2 shrink-0"
          >
            {t("dashboard.createOneHere")}
          </button>
        </div>
      )}

      {/* ── Stats inline header bar ─────────────── */}
      {data && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground -mt-1">
          {data.budgets.activeIncidents > 0 && (
            <Link to="/costs" className="flex items-center gap-1 font-medium text-red-400 hover:text-red-300">
              <PauseCircle className="h-3 w-3" />
              {data.budgets.activeIncidents} incidenti
            </Link>
          )}
          <Link to="/agents" className="flex items-center gap-1 hover:text-foreground">
            <Bot className="h-3 w-3" />
            <span className="font-semibold text-foreground">{data.agents.active + data.agents.running + data.agents.paused + data.agents.error}</span>
            agenti
            {data.agents.running > 0 && <span className="text-emerald-400 text-[10px]">({data.agents.running} attivi)</span>}
          </Link>
          <Link to="/issues" className="flex items-center gap-1 hover:text-foreground">
            <CircleDot className="h-3 w-3" />
            <span className="font-semibold text-foreground">{data.tasks.inProgress}</span>
            in corso
          </Link>
          <Link to="/costs" className="flex items-center gap-1 hover:text-foreground">
            <DollarSign className="h-3 w-3" />
            <span className="font-semibold text-foreground">{formatCents(data.costs.monthSpendCents)}</span>
            mese
          </Link>
          <Link to="/approvals" className="flex items-center gap-1 hover:text-foreground">
            <ShieldCheck className="h-3 w-3" />
            <span className="font-semibold text-foreground">{data.pendingApprovals + data.budgets.pendingApprovals}</span>
            approvazioni
          </Link>
        </div>
      )}


      {/* ── Workflow Graph — issue tree visualization ── */}
      {issues && agents && (
        <WorkflowGraphSafe
          issues={issues}
          agents={agents}
          onApprove={(id) => unblockMutation.mutate({ issueId: id, action: "approve" })}
          onReject={(id) => unblockMutation.mutate({ issueId: id, action: "reject" })}
          onRevision={(id) => unblockMutation.mutate({ issueId: id, action: "revision" })}
          isPending={unblockMutation.isPending}
        />
      )}

      {/* ── Active runs banner ──────────────────── */}
      {activeRuns.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeRuns.map((run) => (
            <div key={run.id} className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] px-3 py-1.5 text-xs">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
              </span>
              <Link to={`/agents/${run.agentId}`} className="font-medium text-foreground hover:underline">{run.agentName}</Link>
              {run.issueId && (() => {
                const issue = (issues ?? []).find((i) => i.id === run.issueId);
                return issue ? (
                  <span className="text-muted-foreground truncate max-w-[200px]">
                    su {issue.identifier} {issue.title}
                  </span>
                ) : null;
              })()}
              <button
                onClick={() => handleCancelRun(run.id)}
                className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <Square className="h-2.5 w-2.5" />
                Stop
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Fallback: recent issues only when no workflow graph visible ── */}
      {issues && agents && (() => {
        // Check if WorkflowGraph would render (same logic as buildTree)
        const childIds = new Set(issues.filter((i) => i.parentId).map((i) => i.parentId!));
        const hasWorkflowRoots = issues.some((i) =>
          !i.parentId && childIds.has(i.id) &&
          (i.status === "in_progress" || i.status === "blocked" || i.status === "todo" ||
           (i.status === "done" && issues.some((c) => c.parentId === i.id && c.status !== "done" && c.status !== "cancelled")))
        );
        if (hasWorkflowRoots) return null;

        return (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Issue recenti
            </h3>
            {recentIssues.length > 0 ? (
              <div className="border border-border divide-y divide-border overflow-hidden rounded-lg">
                {recentIssues.slice(0, 8).map((issue) => (
                  <Link
                    key={issue.id}
                    to={`/issues/${issue.identifier ?? issue.id}`}
                    className="px-3 py-2 text-xs cursor-pointer hover:bg-accent/50 transition-colors no-underline text-inherit flex items-center gap-2"
                  >
                    <StatusIcon status={issue.status} />
                    <span className="font-mono text-muted-foreground shrink-0">{issue.identifier ?? issue.id.slice(0, 8)}</span>
                    <span className="truncate flex-1">{issue.title}</span>
                    {issue.assigneeAgentId && (() => {
                      const name = agentName(issue.assigneeAgentId);
                      return name ? <Identity name={name} size="xs" className="shrink-0" /> : null;
                    })()}
                    <span className="text-muted-foreground shrink-0">{timeAgo(issue.updatedAt)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 py-4">{t("dashboard.noTasksYet")}</p>
            )}
          </div>
        );
      })()}

      <PluginSlotOutlet
        slotTypes={["dashboardWidget"]}
        context={{ companyId: selectedCompanyId }}
        className="grid gap-4 md:grid-cols-2"
        itemClassName="rounded-lg border bg-card p-4 shadow-sm"
      />
    </div>
  );
}
