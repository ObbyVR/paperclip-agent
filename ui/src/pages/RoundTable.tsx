import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { dashboardApi } from "../api/dashboard";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { Identity } from "../components/Identity";
import { StatusIcon } from "../components/StatusIcon";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { cn, formatCents } from "../lib/utils";
import type { Agent, Issue } from "@paperclipai/shared";
import {
  AlertCircle,
  Bot,
  ChevronDown,
  ChevronRight,
  CircleDot,
  DollarSign,
  FolderOpen,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Users,
} from "lucide-react";

/* ── Types ──────────────────────────────────── */

interface ProjectMetrics {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  inReview: number;
  todo: number;
  cancelled: number;
}

interface LeaderReport {
  leader: Agent;
  members: Agent[];
  issues: Issue[];
  metrics: ProjectMetrics;
}

interface ProjectReport {
  projectId: string | null;
  projectName: string;
  projectStatus: string | null;
  leadAgent: Agent | null;
  targetDate: string | null;
  issues: Issue[];
  metrics: ProjectMetrics;
  leaders: LeaderReport[];
  blockers: Issue[];
  pendingApprovals: Issue[];
}

/* ── Helpers ─────────────────────────────────── */

function computeMetrics(issues: Issue[]): ProjectMetrics {
  const m: ProjectMetrics = { total: 0, done: 0, inProgress: 0, blocked: 0, inReview: 0, todo: 0, cancelled: 0 };
  for (const i of issues) {
    m.total++;
    if (i.status === "done") m.done++;
    else if (i.status === "in_progress") m.inProgress++;
    else if (i.status === "blocked") m.blocked++;
    else if (i.status === "in_review") m.inReview++;
    else if (i.status === "todo" || i.status === "backlog") m.todo++;
    else if (i.status === "cancelled") m.cancelled++;
  }
  return m;
}

function buildProjectReports(
  issues: Issue[],
  agents: Agent[],
  projects: Array<{ id: string; name: string; status?: string; leadAgentId?: string | null; targetDate?: string | null; archivedAt?: string | null }>,
): ProjectReport[] {
  const agentMap = new Map<string, Agent>();
  for (const a of agents) agentMap.set(a.id, a);

  // Find CEO (no reportsTo, or reportsTo doesn't exist)
  const ceo = agents.find((a) => !a.reportsTo || !agentMap.has(a.reportsTo)) ?? null;

  // Leaders = direct reports to CEO
  const leaders = ceo ? agents.filter((a) => a.reportsTo === ceo.id) : [];

  // Team members per leader (include leader themselves)
  const teamOf = (leaderId: string): Agent[] => {
    const members = agents.filter((a) => a.reportsTo === leaderId);
    return members;
  };

  // Group issues by projectId
  const issuesByProject = new Map<string | null, Issue[]>();
  for (const issue of issues) {
    const key = issue.projectId ?? null;
    if (!issuesByProject.has(key)) issuesByProject.set(key, []);
    issuesByProject.get(key)!.push(issue);
  }

  const reports: ProjectReport[] = [];

  // Active projects
  for (const project of projects.filter((p) => !p.archivedAt)) {
    const projectIssues = issuesByProject.get(project.id) ?? [];
    const leadAgent = project.leadAgentId ? agentMap.get(project.leadAgentId) ?? null : null;

    // Build leader reports for this project
    const leaderReports: LeaderReport[] = [];
    for (const leader of leaders) {
      const members = teamOf(leader.id);
      const allTeamIds = new Set([leader.id, ...members.map((m) => m.id)]);
      const leaderIssues = projectIssues.filter((i) => i.assigneeAgentId && allTeamIds.has(i.assigneeAgentId));
      if (leaderIssues.length === 0) continue;
      leaderReports.push({
        leader,
        members,
        issues: leaderIssues,
        metrics: computeMetrics(leaderIssues),
      });
    }

    // CEO direct issues (assigned to CEO for this project)
    if (ceo) {
      const ceoIssues = projectIssues.filter((i) => i.assigneeAgentId === ceo.id);
      if (ceoIssues.length > 0) {
        leaderReports.unshift({
          leader: ceo,
          members: [],
          issues: ceoIssues,
          metrics: computeMetrics(ceoIssues),
        });
      }
    }

    // Unassigned or assigned to agents not in any team
    const coveredAgentIds = new Set<string>();
    for (const lr of leaderReports) {
      coveredAgentIds.add(lr.leader.id);
      for (const m of lr.members) coveredAgentIds.add(m.id);
    }
    const uncoveredIssues = projectIssues.filter(
      (i) => i.assigneeAgentId && !coveredAgentIds.has(i.assigneeAgentId),
    );
    if (uncoveredIssues.length > 0) {
      leaderReports.push({
        leader: { id: "__other__", name: "Altri agenti", role: "general" } as Agent,
        members: [],
        issues: uncoveredIssues,
        metrics: computeMetrics(uncoveredIssues),
      });
    }

    reports.push({
      projectId: project.id,
      projectName: project.name,
      projectStatus: (project as any).status ?? null,
      leadAgent,
      targetDate: (project as any).targetDate ?? null,
      issues: projectIssues,
      metrics: computeMetrics(projectIssues),
      leaders: leaderReports,
      blockers: projectIssues.filter((i) => i.status === "blocked"),
      pendingApprovals: projectIssues.filter((i) => i.status === "in_review"),
    });
  }

  // Unassigned to project
  const orphanIssues = issuesByProject.get(null) ?? [];
  if (orphanIssues.length > 0) {
    const leaderReports: LeaderReport[] = [];
    for (const leader of leaders) {
      const members = teamOf(leader.id);
      const allTeamIds = new Set([leader.id, ...members.map((m) => m.id)]);
      const leaderIssues = orphanIssues.filter((i) => i.assigneeAgentId && allTeamIds.has(i.assigneeAgentId));
      if (leaderIssues.length === 0) continue;
      leaderReports.push({ leader, members, issues: leaderIssues, metrics: computeMetrics(leaderIssues) });
    }
    reports.push({
      projectId: null,
      projectName: "Senza progetto",
      projectStatus: null,
      leadAgent: null,
      targetDate: null,
      issues: orphanIssues,
      metrics: computeMetrics(orphanIssues),
      leaders: leaderReports,
      blockers: orphanIssues.filter((i) => i.status === "blocked"),
      pendingApprovals: orphanIssues.filter((i) => i.status === "in_review"),
    });
  }

  return reports;
}

/* ── Progress Bar ────────────────────────────── */

function ProgressBar({ metrics }: { metrics: ProjectMetrics }) {
  if (metrics.total === 0) return null;
  const segments = [
    { count: metrics.done, color: "bg-emerald-500", label: "Completati" },
    { count: metrics.inProgress, color: "bg-cyan-400", label: "In corso" },
    { count: metrics.inReview, color: "bg-violet-500", label: "In revisione" },
    { count: metrics.blocked, color: "bg-amber-500", label: "Bloccati" },
    { count: metrics.todo, color: "bg-muted-foreground/30", label: "Da fare" },
    { count: metrics.cancelled, color: "bg-muted-foreground/15", label: "Annullati" },
  ];

  return (
    <div className="flex gap-0.5 h-2 rounded-full overflow-hidden w-full">
      {segments.map(({ count, color, label }) => {
        if (count === 0) return null;
        const pct = (count / metrics.total) * 100;
        return <div key={label} className={cn("h-full", color)} style={{ width: `${pct}%` }} title={`${label}: ${count}`} />;
      })}
    </div>
  );
}

/* ── Metrics Chips ───────────────────────────── */

function MetricsChips({ metrics }: { metrics: ProjectMetrics }) {
  const items = [
    { count: metrics.done, label: "completati", color: "text-emerald-400" },
    { count: metrics.inProgress, label: "in corso", color: "text-cyan-400" },
    { count: metrics.inReview, label: "in revisione", color: "text-violet-400" },
    { count: metrics.blocked, label: "bloccati", color: "text-amber-400" },
    { count: metrics.todo, label: "da fare", color: "text-muted-foreground" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px]">
      {items.map(({ count, label, color }) => count > 0 && (
        <span key={label} className={cn("font-medium", color)}>
          {count} {label}
        </span>
      ))}
      <span className="text-muted-foreground/50">
        {metrics.total} totali
      </span>
    </div>
  );
}

/* ── Agent Task Row ──────────────────────────── */

function AgentTaskRow({ agent, issues }: { agent: Agent; issues: Issue[] }) {
  const [expanded, setExpanded] = useState(false);
  const activeIssues = issues.filter((i) => i.status !== "done" && i.status !== "cancelled");
  const doneCount = issues.filter((i) => i.status === "done").length;

  return (
    <div className="border-l-2 border-border/30 pl-3 ml-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-2 w-full text-left py-1 group"
      >
        {expanded
          ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
          : <ChevronRight className="h-3 w-3 text-muted-foreground" />
        }
        <Identity name={agent.name} size="xs" />
        <span className="text-xs font-medium group-hover:text-foreground transition-colors">{agent.name}</span>
        <span className="text-[10px] text-muted-foreground">{agent.role}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {activeIssues.length > 0 && <span className="text-cyan-400 mr-2">{activeIssues.length} attivi</span>}
          {doneCount > 0 && <span className="text-emerald-400">{doneCount} fatti</span>}
        </span>
      </button>
      {expanded && activeIssues.length > 0 && (
        <div className="space-y-0.5 pb-1 ml-5">
          {activeIssues.slice(0, 10).map((issue) => (
            <Link
              key={issue.id}
              to={`/issues/${issue.identifier ?? issue.id}`}
              className="flex items-center gap-2 py-1 px-2 rounded text-xs hover:bg-white/5 transition-colors no-underline text-inherit"
            >
              <StatusIcon status={issue.status} />
              <span className="font-mono text-muted-foreground text-[10px] shrink-0">{issue.identifier}</span>
              <span className="truncate">{issue.title}</span>
            </Link>
          ))}
          {activeIssues.length > 10 && (
            <span className="text-[10px] text-muted-foreground/50 pl-2">+{activeIssues.length - 10} altri</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Leader Section ──────────────────────────── */

function LeaderSection({ report, agents }: { report: LeaderReport; agents: Agent[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const agentMap = new Map<string, Agent>();
  for (const a of agents) agentMap.set(a.id, a);

  // Group issues by agent
  const issuesByAgent = new Map<string, Issue[]>();
  for (const issue of report.issues) {
    const key = issue.assigneeAgentId ?? "__unassigned__";
    if (!issuesByAgent.has(key)) issuesByAgent.set(key, []);
    issuesByAgent.get(key)!.push(issue);
  }

  return (
    <div className="rounded-lg border border-border/30 bg-card/30 p-3">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {collapsed
          ? <ChevronRight className="h-3 w-3 text-muted-foreground" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground" />
        }
        {report.leader.id !== "__other__" && <Identity name={report.leader.name} size="sm" />}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold group-hover:text-foreground transition-colors">
            {report.leader.name}
          </span>
          {report.leader.title && (
            <span className="text-[10px] text-muted-foreground ml-1.5">{report.leader.title}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] shrink-0">
          {report.metrics.blocked > 0 && (
            <span className="text-amber-400 font-medium">{report.metrics.blocked} bloccati</span>
          )}
          {report.metrics.inProgress > 0 && (
            <span className="text-cyan-400">{report.metrics.inProgress} attivi</span>
          )}
          <span className="text-muted-foreground/50">{report.metrics.total} task</span>
        </div>
      </button>
      {!collapsed && (
        <div className="mt-2 space-y-1">
          <ProgressBar metrics={report.metrics} />
          <div className="mt-2 space-y-0.5">
            {[...issuesByAgent.entries()].map(([agentId, agentIssues]) => {
              const agent = agentMap.get(agentId);
              if (!agent) return null;
              return <AgentTaskRow key={agentId} agent={agent} issues={agentIssues} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Project Report Card ─────────────────────── */

function ProjectReportCard({
  report,
  agents,
  onAskCeo,
  isAskingCeo,
}: {
  report: ProjectReport;
  agents: Agent[];
  onAskCeo?: (projectId: string, projectName: string) => void;
  isAskingCeo: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Card border color based on health
  const hasBlockers = report.blockers.length > 0;
  const hasPendingApprovals = report.pendingApprovals.length > 0;
  const borderColor = hasBlockers
    ? "border-l-amber-500"
    : report.metrics.inProgress > 0
      ? "border-l-cyan-500"
      : report.metrics.done === report.metrics.total && report.metrics.total > 0
        ? "border-l-emerald-500"
        : "border-l-border";

  const progressPct = report.metrics.total > 0
    ? Math.round((report.metrics.done / report.metrics.total) * 100)
    : 0;

  return (
    <div className={cn(
      "rounded-xl border border-border bg-[#0c0e14] overflow-hidden border-l-[3px]",
      borderColor,
    )}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        {collapsed
          ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        }
        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold">{report.projectName}</span>
          {report.leadAgent && (
            <span className="text-xs text-muted-foreground ml-2">
              Lead: {report.leadAgent.name}
            </span>
          )}
          {report.targetDate && (
            <span className="text-[10px] text-muted-foreground ml-2">
              Target: {new Date(report.targetDate).toLocaleDateString("it-IT")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {hasBlockers && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400">
              <AlertCircle className="h-3 w-3" />
              {report.blockers.length} blocchi
            </span>
          )}
          {hasPendingApprovals && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-violet-400">
              {report.pendingApprovals.length} approvazioni
            </span>
          )}
          <span className="text-xs font-medium text-emerald-400">
            {progressPct}%
          </span>
        </div>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          {/* Progress + metrics */}
          <ProgressBar metrics={report.metrics} />
          <MetricsChips metrics={report.metrics} />

          {/* Blockers highlight */}
          {hasBlockers && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2.5 space-y-1">
              <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">Blocchi attivi</span>
              {report.blockers.map((issue) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.identifier ?? issue.id}`}
                  className="flex items-center gap-2 text-xs no-underline text-inherit hover:text-amber-300 transition-colors"
                >
                  <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />
                  <span className="font-mono text-muted-foreground text-[10px]">{issue.identifier}</span>
                  <span className="truncate">{issue.title}</span>
                  {issue.assigneeAgentId && (() => {
                    const agent = agents.find((a) => a.id === issue.assigneeAgentId);
                    return agent ? <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">{agent.name}</span> : null;
                  })()}
                </Link>
              ))}
            </div>
          )}

          {/* Leader sections */}
          {report.leaders.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Report per team</span>
              {report.leaders.map((lr) => (
                <LeaderSection key={lr.leader.id} report={lr} agents={agents} />
              ))}
            </div>
          )}

          {/* Ask CEO button */}
          {onAskCeo && report.projectId && (
            <button
              type="button"
              onClick={() => onAskCeo(report.projectId!, report.projectName)}
              disabled={isAskingCeo}
              className={cn(
                "flex items-center gap-2 w-full justify-center py-2 rounded-lg border text-xs font-medium transition-colors",
                "border-purple-500/20 bg-purple-500/[0.04] text-purple-300 hover:bg-purple-500/[0.08]",
                isAskingCeo && "opacity-50 cursor-not-allowed",
              )}
            >
              {isAskingCeo
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <MessageSquarePlus className="h-3.5 w-3.5" />
              }
              Chiedi analisi al CEO
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ───────────────────────────────── */

export function RoundTable() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Round Table" }]);
  }, [setBreadcrumbs]);

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues, isLoading: issuesLoading } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: dashboardData } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: [...queryKeys.liveRuns(selectedCompanyId ?? ""), "round-table"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!, 4),
    enabled: !!selectedCompanyId,
    refetchInterval: 60000,
  });
  const activeRunCount = (liveRuns ?? []).filter((r) => r.status === "running" || r.status === "queued").length;

  // Build reports
  const reports = useMemo(() => {
    if (!issues || !agents || !projects) return [];
    return buildProjectReports(issues, agents, projects);
  }, [issues, agents, projects]);

  // CEO agent for "ask CEO" feature
  const ceoAgent = useMemo(() => {
    if (!agents) return null;
    const agentMap = new Map(agents.map((a) => [a.id, a]));
    return agents.find((a) => !a.reportsTo || !agentMap.has(a.reportsTo)) ?? null;
  }, [agents]);

  // Create issue mutation for "Ask CEO"
  const askCeoMutation = useMutation({
    mutationFn: async ({ projectId, projectName }: { projectId: string; projectName: string }) => {
      if (!selectedCompanyId || !ceoAgent) throw new Error("Missing context");
      const report = reports.find((r) => r.projectId === projectId);
      const description = [
        `## Richiesta report di stato`,
        ``,
        `Progetto: **${projectName}**`,
        ``,
        `### Cosa serve`,
        `1. Sintesi dello stato attuale del progetto`,
        `2. Elenco task completati dall'ultimo aggiornamento`,
        `3. Blocchi attuali e cosa serve per sbloccarli`,
        `4. Rischi identificati`,
        `5. Prossimi step consigliati`,
        ``,
        `### Contesto attuale`,
        report ? [
          `- Task totali: ${report.metrics.total}`,
          `- Completati: ${report.metrics.done}`,
          `- In corso: ${report.metrics.inProgress}`,
          `- Bloccati: ${report.metrics.blocked}`,
          `- In revisione: ${report.metrics.inReview}`,
          `- Da fare: ${report.metrics.todo}`,
        ].join("\n") : "Nessun dato disponibile",
        ``,
        `Raccogli input dai capi reparto coinvolti prima di rispondere.`,
      ].join("\n");

      return issuesApi.create(selectedCompanyId, {
        title: `[Report] Stato progetto: ${projectName}`,
        description,
        assigneeAgentId: ceoAgent.id,
        projectId,
        priority: "medium",
        status: "todo",
      });
    },
    onSuccess: (issue) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      navigate(`/issues/${issue.identifier ?? issue.id}`);
    },
  });

  // Refresh all data
  const handleRefresh = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedCompanyId) });
  };

  const isLoading = agentsLoading || issuesLoading || projectsLoading;

  const globalMetrics = useMemo(() => {
    return computeMetrics(issues ?? []);
  }, [issues]);

  // ── All hooks MUST be above conditional returns ──

  if (!selectedCompanyId) {
    return <EmptyState icon={Users} message="Seleziona un'azienda per accedere alla Round Table." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  return (
    <div className="space-y-4">
      {/* ── Header bar ─────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-purple-400" />
          <h1 className="text-lg font-semibold">Round Table</h1>
          {ceoAgent && (
            <span className="text-xs text-muted-foreground">
              CEO: {ceoAgent.name}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Aggiorna
        </button>
      </div>

      {/* ── Global metrics ─────────────────────── */}
      {dashboardData && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Bot className="h-3 w-3" />
            <span className="font-semibold text-foreground">{dashboardData.agents.active + dashboardData.agents.running}</span>
            agenti
            {dashboardData.agents.running > 0 && <span className="text-emerald-400 text-[10px]">({dashboardData.agents.running} attivi)</span>}
          </span>
          <span className="flex items-center gap-1">
            <CircleDot className="h-3 w-3" />
            <span className="font-semibold text-foreground">{globalMetrics.inProgress}</span>
            in corso
          </span>
          {globalMetrics.blocked > 0 && (
            <span className="flex items-center gap-1 text-amber-400 font-medium">
              <AlertCircle className="h-3 w-3" />
              {globalMetrics.blocked} bloccati
            </span>
          )}
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            <span className="font-semibold text-foreground">{formatCents(dashboardData.costs.monthSpendCents)}</span>
            mese
          </span>
          {activeRunCount > 0 && (
            <span className="flex items-center gap-1 text-cyan-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              {activeRunCount} run attive
            </span>
          )}
        </div>
      )}

      {/* ── Global progress ───────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
            Progresso globale
          </span>
          <span className="text-xs font-medium text-emerald-400">
            {globalMetrics.total > 0 ? Math.round((globalMetrics.done / globalMetrics.total) * 100) : 0}%
          </span>
        </div>
        <ProgressBar metrics={globalMetrics} />
        <MetricsChips metrics={globalMetrics} />
      </div>

      {/* ── Project Reports ──────────────────── */}
      {reports.length === 0 ? (
        <EmptyState icon={FolderOpen} message="Nessun progetto o task trovato." />
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <ProjectReportCard
              key={report.projectId ?? "__none__"}
              report={report}
              agents={agents ?? []}
              onAskCeo={ceoAgent ? (pid, pname) => askCeoMutation.mutate({ projectId: pid, projectName: pname }) : undefined}
              isAskingCeo={askCeoMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* ── Footer ───────────────────────────── */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/40 pt-2 border-t border-border/20">
        <span>Ultimo aggiornamento: {new Date().toLocaleTimeString("it-IT")}</span>
        <span>{(issues ?? []).length} task | {(agents ?? []).length} agenti | {(projects ?? []).length} progetti</span>
      </div>
    </div>
  );
}
