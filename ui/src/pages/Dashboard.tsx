import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
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
import { ActivityRow } from "../components/ActivityRow";
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn, formatCents } from "../lib/utils";
import { Bot, ChevronDown, CircleDot, DollarSign, LayoutDashboard, PauseCircle, Play, ShieldCheck, Square, Zap } from "lucide-react";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
import { WorkflowVisualizer, type WorkflowEvent, type WorkflowLane, type WorkflowStats } from "../components/WorkflowVisualizer";
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
  const [animatedActivityIds, setAnimatedActivityIds] = useState<Set<string>>(new Set());
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hydratedActivityRef = useRef(false);
  const activityAnimationTimersRef = useRef<number[]>([]);

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

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const recentIssues = issues ? getRecentIssues(issues) : [];
  const recentActivity = useMemo(() => (activity ?? []).slice(0, 10), [activity]);

  useEffect(() => {
    for (const timer of activityAnimationTimersRef.current) {
      window.clearTimeout(timer);
    }
    activityAnimationTimersRef.current = [];
    seenActivityIdsRef.current = new Set();
    hydratedActivityRef.current = false;
    setAnimatedActivityIds(new Set());
  }, [selectedCompanyId]);

  useEffect(() => {
    if (recentActivity.length === 0) return;

    const seen = seenActivityIdsRef.current;
    const currentIds = recentActivity.map((event) => event.id);

    if (!hydratedActivityRef.current) {
      for (const id of currentIds) seen.add(id);
      hydratedActivityRef.current = true;
      return;
    }

    const newIds = currentIds.filter((id) => !seen.has(id));
    if (newIds.length === 0) {
      for (const id of currentIds) seen.add(id);
      return;
    }

    setAnimatedActivityIds((prev) => {
      const next = new Set(prev);
      for (const id of newIds) next.add(id);
      return next;
    });

    for (const id of newIds) seen.add(id);

    const timer = window.setTimeout(() => {
      setAnimatedActivityIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.delete(id);
        return next;
      });
      activityAnimationTimersRef.current = activityAnimationTimersRef.current.filter((t) => t !== timer);
    }, 980);
    activityAnimationTimersRef.current.push(timer);
  }, [recentActivity]);

  useEffect(() => {
    return () => {
      for (const timer of activityAnimationTimersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    return map;
  }, [issues, agents, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  // ── All hooks MUST be above conditional returns ──
  const [showDetails, setShowDetails] = useState(false);

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


      {/* ── Workflow Visualizer — real data from liveRuns ── */}
      {(() => {
        const runs = liveRuns ?? [];
        if (runs.length === 0) {
          return (
            <div className="relative overflow-hidden rounded-xl border border-border bg-[#0c0e14] px-6 py-10 text-center">
              <div className="flex flex-col items-center gap-2">
                <Play className="h-6 w-6 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground/50">Nessun workflow eseguito</p>
                <p className="text-xs text-muted-foreground/30">Assegna un task a un agente per vedere il workflow qui</p>
              </div>
            </div>
          );
        }
        // Group runs by agent, most recent first
        const agentRuns = new Map<string, typeof runs>();
        for (const run of runs) {
          const key = run.agentName ?? run.agentId;
          if (!agentRuns.has(key)) agentRuns.set(key, []);
          agentRuns.get(key)!.push(run);
        }
        // Build issue title map for better labels
        const issueTitleMap = new Map<string, string>();
        for (const issue of (issues ?? [])) {
          issueTitleMap.set(issue.id, issue.identifier ? `${issue.identifier}` : issue.title.substring(0, 30));
        }
        const runLabel = (run: typeof runs[0]) => {
          if (run.issueId) {
            const issue = (issues ?? []).find((i) => i.id === run.issueId);
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
                : run.status === "failed" || run.status === "error" ? "error" as const
                : run.finishedAt ? "done" as const
                : "pending" as const,
              statusLabel: run.status === "running" ? "In esecuzione..."
                : run.status === "failed" ? "Fallito"
                : undefined,
            })),
          };
        });
        const allSteps = lanes.flatMap((l) => l.steps);
        const completed = allSteps.filter((s) => s.status === "done").length;
        const active = allSteps.filter((s) => s.status === "active").length;
        const errored = allSteps.filter((s) => s.status === "error").length;
        const stats: WorkflowStats = {
          totalSteps: allSteps.length,
          completedSteps: completed,
          activeSteps: active,
          agents: lanes.length,
        };

        // Build events from activity feed + pending approvals + blocked issues
        const events: WorkflowEvent[] = [];

        // Action translations
        const actionLabels: Record<string, string> = {
          "issue.comment_added": "Nuovo commento",
          "issue.updated": "Stato aggiornato",
          "issue.document_created": "Documento creato",
          "issue.document_updated": "Documento aggiornato",
          "issue.checked_out": "Presa in carico",
          "issue.created": "Issue creata",
          "issue.assigned": "Assegnata",
          "agent.hired": "Agente assunto",
          "agent.created": "Agente creato",
          "run.started": "Run avviato",
          "run.completed": "Run completato",
          "run.failed": "Run fallito",
        };
        const noiseActions = new Set(["issue.read_marked", "agent.key_created"]);

        // 1. Pending approvals
        for (const approval of (pendingApprovalsList ?? [])) {
          const title = approval.payload?.title ?? approval.payload?.name ?? "Approvazione richiesta";
          const agName = approval.requestedByAgentId
            ? (agents ?? []).find((a) => a.id === approval.requestedByAgentId)?.name
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

        // 2. Blocked issues = waiting for founder review (show as approval-like)
        const blockedIssues = (issues ?? []).filter((i) => i.status === "blocked");
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

        // 3. Recent activity (filtered, translated)
        for (const event of recentActivity) {
          if (noiseActions.has(event.action)) continue;
          const agName = event.agentId ? agentMap.get(event.agentId)?.name : undefined;
          const label = actionLabels[event.action] ?? event.action.replace(/\./g, " ").replace(/_/g, " ");
          const isOutput = event.action.includes("comment") || event.action.includes("document") || event.action.includes("completed");
          const isError = event.action.includes("failed") || event.action.includes("error");
          // Get issue title if entity is an issue
          const issueTitle = event.entityType === "issue"
            ? (issues ?? []).find((i) => i.id === event.entityId)
            : undefined;
          const entityDesc = issueTitle
            ? `${issueTitle.identifier ?? ""} ${issueTitle.title}`.trim()
            : entityNameMap.get(`${event.entityType}:${event.entityId}`) ?? "";
          const issueLink = event.entityType === "issue"
            ? `/issues/${entityNameMap.get(`issue:${event.entityId}`) ?? event.entityId}`
            : undefined;
          // Extract useful detail
          const detail = event.details as Record<string, unknown> | null;
          const prev = detail?._previous as Record<string, unknown> | undefined;
          const statusChange = prev ? ` (${String(prev.status ?? "")} → ${String(detail?.status ?? "")})` : "";
          const docTitle = detail?.title ? ` — ${String(detail.title).substring(0, 40)}` : "";

          events.push({
            id: `activity-${event.id}`,
            ts: new Date(event.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
            type: isError ? "error" as const : isOutput ? "output" as const : "info" as const,
            agentName: agName,
            message: `${label}${statusChange}${docTitle} — ${entityDesc}`.substring(0, 120),
            outputLink: issueLink,
          });
        }

        // 4. Failed runs
        for (const run of runs.filter((r) => r.status === "failed")) {
          const issueTitle = run.issueId ? (issues ?? []).find((i) => i.id === run.issueId) : undefined;
          events.push({
            id: `run-fail-${run.id}`,
            ts: new Date(run.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
            type: "error" as const,
            agentName: run.agentName,
            message: issueTitle ? `Run fallito — ${issueTitle.identifier ?? ""} ${issueTitle.title}`.trim() : `Run fallito (${run.invocationSource})`,
          });
        }

        // Sort by time descending, deduplicate by id prefix, limit
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

      {/* ── Workflow controls ───────────────────── */}
      {activeRuns.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeRuns.map((run) => (
            <div key={run.id} className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
              </span>
              <Link to={`/agents/${run.agentId}`} className="font-medium text-foreground hover:underline">{run.agentName}</Link>
              {run.issueId && <span className="text-muted-foreground">su task</span>}
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

      {/* ── Activity feed sotto il workflow ──────── */}
      {recentActivity.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {t("activity.title")}
          </h3>
          <div className="border border-border divide-y divide-border overflow-hidden rounded-lg">
            {recentActivity.slice(0, 6).map((event) => (
              <ActivityRow
                key={event.id}
                event={event}
                agentMap={agentMap}
                entityNameMap={entityNameMap}
                entityTitleMap={entityTitleMap}
                className={animatedActivityIds.has(event.id) ? "activity-row-enter" : undefined}
              />
            ))}
          </div>
        </div>
      )}

      <PluginSlotOutlet
        slotTypes={["dashboardWidget"]}
        context={{ companyId: selectedCompanyId }}
        className="grid gap-4 md:grid-cols-2"
        itemClassName="rounded-lg border bg-card p-4 shadow-sm"
      />

      {/* ── Dettagli (collapsible) — agenti, task recenti ── */}
      <div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")} />
          {showDetails ? "Nascondi dettagli" : "Mostra dettagli (agenti, task recenti)"}
        </button>

        {showDetails && (
          <div className="mt-3 space-y-4">
            <ActiveAgentsPanel companyId={selectedCompanyId!} />

            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {t("dashboard.recentTasks")}
              </h3>
              {recentIssues.length === 0 ? (
                <div className="border border-border p-4">
                  <p className="text-sm text-muted-foreground">{t("dashboard.noTasksYet")}</p>
                </div>
              ) : (
                <div className="border border-border divide-y divide-border overflow-hidden rounded-lg">
                  {recentIssues.slice(0, 10).map((issue) => (
                    <Link
                      key={issue.id}
                      to={`/issues/${issue.identifier ?? issue.id}`}
                      className="px-4 py-3 text-sm cursor-pointer hover:bg-accent/50 transition-colors no-underline text-inherit block"
                    >
                      <div className="flex items-start gap-2 sm:items-center sm:gap-3">
                        <span className="shrink-0 sm:hidden">
                          <StatusIcon status={issue.status} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:contents">
                          <span className="line-clamp-2 text-sm sm:order-2 sm:flex-1 sm:min-w-0 sm:line-clamp-none sm:truncate">
                            {issue.title}
                          </span>
                          <span className="flex items-center gap-2 sm:order-1 sm:shrink-0">
                            <span className="hidden sm:inline-flex"><StatusIcon status={issue.status} /></span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {issue.identifier ?? issue.id.slice(0, 8)}
                            </span>
                            {issue.assigneeAgentId && (() => {
                              const name = agentName(issue.assigneeAgentId);
                              return name
                                ? <span className="hidden sm:inline-flex"><Identity name={name} size="sm" /></span>
                                : null;
                            })()}
                            <span className="text-xs text-muted-foreground sm:hidden">&middot;</span>
                            <span className="text-xs text-muted-foreground shrink-0 sm:order-last">
                              {timeAgo(issue.updatedAt)}
                            </span>
                          </span>
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
