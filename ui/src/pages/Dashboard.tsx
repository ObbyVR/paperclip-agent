import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
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
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { formatCents } from "../lib/utils";
import { Bot, ChevronDown, ChevronRight, CircleDot, DollarSign, FolderOpen, LayoutDashboard, PauseCircle, ShieldCheck, Square } from "lucide-react";
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

/* ── Collapsible project section for "all projects" view ── */
function CollapsibleProjectSection({
  name,
  issueCount,
  activeRunCount,
  children,
}: {
  name: string;
  issueCount: number;
  activeRunCount: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {collapsed
          ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        }
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
          {name}
        </h3>
        <span className="text-[10px] text-muted-foreground/60">
          {issueCount} task{issueCount !== 1 ? "" : ""}
        </span>
        {activeRunCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-cyan-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-500" />
            </span>
            {activeRunCount} attivi
          </span>
        )}
      </button>
      {!collapsed && children}
    </div>
  );
}

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

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projectsList } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Filter issues by selected project (null = all, "__none__" = unassigned)
  const filteredIssues = useMemo(() => {
    if (!issues) return [];
    if (!selectedProjectId) return issues;
    if (selectedProjectId === "__none__") return issues.filter((i) => !i.projectId);
    return issues.filter((i) => i.projectId === selectedProjectId);
  }, [issues, selectedProjectId]);

  // Count unassigned issues for the filter label
  const unassignedCount = useMemo(() => {
    if (!issues) return 0;
    return issues.filter((i) => !i.projectId).length;
  }, [issues]);

  const recentIssues = filteredIssues.length > 0 ? getRecentIssues(filteredIssues) : [];
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

  // Fetch all runs to identify failed issues for WorkflowGraph coloring
  const { data: allRuns } = useQuery({
    queryKey: [...queryKeys.liveRuns(selectedCompanyId ?? ""), "all-runs"],
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 60000,
  });

  // Build sets of failed issue IDs + error messages (only for issues that haven't succeeded since)
  const { failedIssueIds, failedIssueErrors } = useMemo(() => {
    const ids = new Set<string>();
    const errors = new Map<string, string>();
    if (!allRuns) return { failedIssueIds: ids, failedIssueErrors: errors };

    // Group runs by issueId, check if latest run for each issue is a failure
    const latestByIssue = new Map<string, { status: string; error: string }>();
    for (const run of allRuns) {
      const issueId = (run as any).contextSnapshot?.issueId;
      if (!issueId) continue;
      // Runs are ordered newest first — only keep the first (latest) per issue
      if (!latestByIssue.has(issueId)) {
        latestByIssue.set(issueId, { status: run.status, error: run.error ?? "" });
      }
    }
    for (const [issueId, { status, error }] of latestByIssue) {
      if (status === "failed") {
        ids.add(issueId);
        if (error) errors.set(issueId, error);
      }
    }
    return { failedIssueIds: ids, failedIssueErrors: errors };
  }, [allRuns]);

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

      {/* ── Project filter + Stats inline header bar ─────────────── */}
      {data && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground -mt-1">
          {projectsList && projectsList.length > 1 && (
            <div className="flex items-center gap-1.5 mr-2 pr-2 border-r border-border">
              <FolderOpen className="h-3 w-3" />
              <select
                value={selectedProjectId ?? ""}
                onChange={(e) => setSelectedProjectId(e.target.value || null)}
                className="bg-transparent text-xs font-medium text-foreground border-none outline-none cursor-pointer appearance-none pr-4"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 0 center" }}
              >
                <option value="">Tutti i progetti</option>
                {projectsList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                {unassignedCount > 0 && (
                  <option value="__none__">Senza progetto ({unassignedCount})</option>
                )}
              </select>
            </div>
          )}
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
            <span className="font-semibold text-foreground">{data.pendingApprovals + data.budgets.pendingApprovals + (issues?.filter((i) => i.status === "in_review").length ?? 0)}</span>
            approvazioni
          </Link>
        </div>
      )}


      {/* ── Workflow Graphs — per-project visualization ── */}
      {issues && agents && (() => {
        const wfProps = {
          agents,
          onApprove: (id: string) => unblockMutation.mutate({ issueId: id, action: "approve" }),
          onReject: (id: string) => unblockMutation.mutate({ issueId: id, action: "reject" }),
          onRevision: (id: string) => unblockMutation.mutate({ issueId: id, action: "revision" }),
          isPending: unblockMutation.isPending,
          failedIssueIds,
          failedIssueErrors,
          onCancelRun: handleCancelRun,
        };

        if (selectedProjectId) {
          // Specific project selected: show that project's graph + other projects collapsed
          const projectRuns = activeRuns.filter((r) => {
            if (!r.issueId) return false;
            return filteredIssues.some((i) => i.id === r.issueId);
          });

          const otherProjects = (projectsList ?? []).filter((p) => p.id !== selectedProjectId);

          return (
            <>
              {filteredIssues.length > 0 && (
                <WorkflowGraphSafe
                  issues={filteredIssues}
                  activeRuns={projectRuns}
                  {...wfProps}
                />
              )}
              {otherProjects.map((project) => {
                const projectIssues = issues.filter((i) => i.projectId === project.id);
                if (projectIssues.length === 0) return null;
                const projRuns = activeRuns.filter((r) => r.issueId && projectIssues.some((i) => i.id === r.issueId));
                return (
                  <CollapsibleProjectSection key={project.id} name={project.name} issueCount={projectIssues.length} activeRunCount={projRuns.length}>
                    <WorkflowGraphSafe
                      issues={projectIssues}
                      activeRuns={projRuns}
                      {...wfProps}
                    />
                  </CollapsibleProjectSection>
                );
              })}
            </>
          );
        }

        // "All projects" view — each project gets its own collapsible section
        const projects = projectsList ?? [];
        // Group issues by project
        const issuesByProject = new Map<string | null, Issue[]>();
        for (const issue of issues) {
          const key = issue.projectId ?? null;
          if (!issuesByProject.has(key)) issuesByProject.set(key, []);
          issuesByProject.get(key)!.push(issue);
        }

        if (projects.length <= 1 && !issuesByProject.has(null)) {
          // Single project or no projects — show all in one graph
          const allRuns = activeRuns.filter((r) => r.issueId && issues.some((i) => i.id === r.issueId));
          return issues.length > 0 ? (
            <WorkflowGraphSafe issues={issues} activeRuns={allRuns} {...wfProps} />
          ) : null;
        }

        return (
          <>
            {projects.map((project) => {
              const projectIssues = issuesByProject.get(project.id) ?? [];
              if (projectIssues.length === 0) return null;
              const projRuns = activeRuns.filter((r) => r.issueId && projectIssues.some((i) => i.id === r.issueId));
              return (
                <CollapsibleProjectSection key={project.id} name={project.name} issueCount={projectIssues.length} activeRunCount={projRuns.length}>
                  <WorkflowGraphSafe
                    issues={projectIssues}
                    activeRuns={projRuns}
                    {...wfProps}
                  />
                </CollapsibleProjectSection>
              );
            })}
            {/* Unassigned issues */}
            {(() => {
              const unassigned = issuesByProject.get(null) ?? [];
              if (unassigned.length === 0) return null;
              const unassignedRuns = activeRuns.filter((r) => r.issueId && unassigned.some((i) => i.id === r.issueId));
              return (
                <CollapsibleProjectSection name="Senza progetto" issueCount={unassigned.length} activeRunCount={unassignedRuns.length}>
                  <WorkflowGraphSafe
                    issues={unassigned}
                    activeRuns={unassignedRuns}
                    {...wfProps}
                  />
                </CollapsibleProjectSection>
              );
            })()}
          </>
        );
      })()}

      {/* ── Orphan active runs (not linked to any issue) ── */}
      {(() => {
        const orphanRuns = activeRuns.filter((r) => !r.issueId);
        if (orphanRuns.length === 0) return null;
        return (
          <div className="flex flex-wrap items-center gap-2">
            {orphanRuns.map((run) => (
              <div key={run.id} className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] px-3 py-1.5 text-xs">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
                </span>
                <Link to={`/agents/${run.agentId}`} className="font-medium text-foreground hover:underline">{run.agentName}</Link>
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
        );
      })()}

      {/* ── Fallback: recent issues only when no workflow graph visible ── */}
      {filteredIssues.length > 0 && agents && (() => {
        // Check if WorkflowGraph would render (same logic as buildTree — all statuses)
        const childIds = new Set(filteredIssues.filter((i) => i.parentId).map((i) => i.parentId!));
        const hasWorkflowRoots = filteredIssues.some((i) =>
          !i.parentId && childIds.has(i.id),
        );
        // Also check for standalone active issues (no parent, no children)
        const hasStandaloneRoots = filteredIssues.some((i) =>
          !i.parentId && !childIds.has(i.id) &&
          (i.status === "in_progress" || i.status === "blocked" || i.status === "todo" || i.status === "in_review")
        );
        if (hasWorkflowRoots || hasStandaloneRoots) return null;

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
