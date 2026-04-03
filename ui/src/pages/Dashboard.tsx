import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
import { activityApi } from "../api/activity";
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
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn, formatCents } from "../lib/utils";
import { Bot, ChevronDown, CircleDot, DollarSign, FolderOpen, LayoutDashboard, PauseCircle, Play, ShieldCheck, Square, Zap } from "lucide-react";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
import { WorkflowVisualizer, type WorkflowEvent, type WorkflowLane, type WorkflowStats } from "../components/WorkflowVisualizer";
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

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
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
  const recentActivity = useMemo(() => (activity ?? []).slice(0, 15), [activity]);

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
            <span className="font-semibold text-foreground">{data.pendingApprovals + data.budgets.pendingApprovals}</span>
            approvazioni
          </Link>
        </div>
      )}


      {/* ── Workflow Graph — issue tree visualization ── */}
      {filteredIssues.length > 0 && agents && (
        <WorkflowGraphSafe
          issues={filteredIssues}
          agents={agents}
          onApprove={(id) => unblockMutation.mutate({ issueId: id, action: "approve" })}
          onReject={(id) => unblockMutation.mutate({ issueId: id, action: "reject" })}
          onRevision={(id) => unblockMutation.mutate({ issueId: id, action: "revision" })}
          isPending={unblockMutation.isPending}
          failedIssueIds={failedIssueIds}
          failedIssueErrors={failedIssueErrors}
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
                const issue = filteredIssues.find((i) => i.id === run.issueId);
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

      {/* ── WorkflowVisualizer — multi-lane pipeline view ── */}
      {allRuns && allRuns.length > 0 && agents && (() => {
        const runs = allRuns;
        const runKey = (r: typeof runs[0]) => `${r.agentId}::${(r as any).contextSnapshot?.issueId ?? r.id}`;
        const bestRuns = new Map<string, typeof runs[0]>();
        for (const run of [...runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())) {
          const key = runKey(run);
          if (!bestRuns.has(key)) bestRuns.set(key, run);
        }
        const dedupedRuns = Array.from(bestRuns.values());

        const agentRuns = new Map<string, typeof runs>();
        for (const run of dedupedRuns) {
          const key = agentMap.get(run.agentId)?.name ?? run.agentId;
          if (!agentRuns.has(key)) agentRuns.set(key, []);
          agentRuns.get(key)!.push(run);
        }

        const runLabel = (run: typeof runs[0]) => {
          const issueId = (run as any).contextSnapshot?.issueId;
          if (issueId) {
            const issue = filteredIssues.find((i) => i.id === issueId);
            if (issue) return issue.title.length > 35 ? issue.title.substring(0, 35) + "…" : issue.title;
          }
          if (run.invocationSource === "timer") return "Heartbeat";
          return run.triggerDetail ?? "Run";
        };

        const lanes: WorkflowLane[] = Array.from(agentRuns.entries()).map(([name, agentRunList]) => {
          const sorted = [...agentRunList].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          return {
            agentName: name,
            agentLink: `/agents/${sorted[0].agentId}`,
            steps: sorted.map((run) => ({
              id: run.id,
              label: runLabel(run),
              icon: Zap,
              status: run.status === "running" ? "active" as const
                : run.status === "queued" ? "waiting" as const
                : run.status === "succeeded" ? "done" as const
                : run.status === "failed" || run.status === "timed_out" ? "error" as const
                : run.finishedAt ? "done" as const
                : "pending" as const,
            })),
          };
        });

        if (lanes.length === 0) return null;

        const allSteps = lanes.flatMap((l) => l.steps);
        const completed = allSteps.filter((s) => s.status === "done").length;
        const active = allSteps.filter((s) => s.status === "active").length;
        const stats: WorkflowStats = {
          totalSteps: allSteps.length,
          completedSteps: completed,
          activeSteps: active,
          agents: lanes.length,
        };

        const actionLabels: Record<string, string> = {
          "issue.comment_added": "Nuovo commento",
          "issue.updated": "Stato aggiornato",
          "issue.document_created": "Documento creato",
          "issue.created": "Issue creata",
          "issue.assigned": "Assegnata",
          "agent.hired": "Agente assunto",
          "agent.created": "Agente creato",
        };
        const noiseActions = new Set(["issue.read_marked", "agent.key_created", "issue.document_updated"]);

        const events: WorkflowEvent[] = [];

        for (const approval of (pendingApprovalsList ?? [])) {
          const title = (approval.payload as any)?.title ?? (approval.payload as any)?.name ?? "Approvazione richiesta";
          const agName = approval.requestedByAgentId
            ? agents.find((a) => a.id === approval.requestedByAgentId)?.name
            : undefined;
          events.push({
            id: `approval-${approval.id}`,
            ts: new Date(approval.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
            type: "approval" as const,
            agentName: agName ?? "Board",
            message: String(title),
            outputLink: `/approvals/${approval.id}`,
          });
        }

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const blockedIssues = filteredIssues.filter((i) => i.status === "blocked" && new Date(i.updatedAt) > sevenDaysAgo);
        for (const issue of blockedIssues) {
          const assigneeName = issue.assigneeAgentId ? agentMap.get(issue.assigneeAgentId)?.name : undefined;
          events.push({
            id: `blocked-${issue.id}`,
            ts: new Date(issue.updatedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
            type: "approval" as const,
            agentName: assigneeName,
            stepLabel: "In attesa di review",
            message: `${issue.identifier ?? ""} ${issue.title}`.trim(),
            outputLink: `/issues/${issue.identifier ?? issue.id}`,
          });
        }

        for (const event of recentActivity) {
          if (noiseActions.has(event.action)) continue;
          if (!event.agentId && !event.action.includes("hired") && !event.action.includes("created")) continue;
          const agName = event.agentId ? agentMap.get(event.agentId)?.name : undefined;
          const label = actionLabels[event.action] ?? event.action.replace(/\./g, " ").replace(/_/g, " ");
          const isOutput = event.action.includes("comment") || event.action.includes("document") || event.action.includes("completed");
          const isError = event.action.includes("failed") || event.action.includes("error");
          const issueTitle = event.entityType === "issue"
            ? filteredIssues.find((i) => i.id === event.entityId)
            : undefined;
          const entityDesc = issueTitle
            ? `${issueTitle.identifier ?? ""} ${issueTitle.title}`.trim()
            : "";
          const issueLink = event.entityType === "issue" && issueTitle
            ? `/issues/${issueTitle.identifier ?? event.entityId}`
            : undefined;
          const detail = event.details as Record<string, unknown> | null;
          const prev = detail?._previous as Record<string, unknown> | undefined;
          const statusChange = prev ? ` (${String(prev.status ?? "")} → ${String(detail?.status ?? "")})` : "";

          events.push({
            id: `activity-${event.id}`,
            ts: new Date(event.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
            type: isError ? "error" as const : isOutput ? "output" as const : "info" as const,
            agentName: agName,
            message: `${label}${statusChange} — ${entityDesc}`.substring(0, 120),
            outputLink: issueLink,
          });
        }

        for (const run of runs.filter((r) => r.status === "failed")) {
          const issueId = (run as any).contextSnapshot?.issueId;
          const issueTitle = issueId ? filteredIssues.find((i) => i.id === issueId) : undefined;
          events.push({
            id: `run-fail-${run.id}`,
            ts: new Date(run.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
            type: "error" as const,
            agentName: agentMap.get(run.agentId)?.name,
            message: issueTitle ? `Run fallito — ${issueTitle.identifier ?? ""} ${issueTitle.title}`.trim() : `Run fallito (${run.invocationSource})`,
          });
        }

        events.sort((a, b) => b.ts.localeCompare(a.ts));
        const seen = new Set<string>();
        const deduped = events.filter((e) => {
          const key = e.message.substring(0, 50);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        return <WorkflowVisualizer lanes={lanes} stats={stats} events={deduped.length > 0 ? deduped.slice(0, 15) : undefined} />;
      })()}

      {/* ── Fallback: recent issues only when no workflow graph visible ── */}
      {filteredIssues.length > 0 && agents && (() => {
        // Check if WorkflowGraph would render (same logic as buildTree)
        const childIds = new Set(filteredIssues.filter((i) => i.parentId).map((i) => i.parentId!));
        const hasWorkflowRoots = filteredIssues.some((i) =>
          !i.parentId && childIds.has(i.id) &&
          (i.status === "in_progress" || i.status === "blocked" || i.status === "todo" ||
           (i.status === "done" && filteredIssues.some((c) => c.parentId === i.id && c.status !== "done" && c.status !== "cancelled")))
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
