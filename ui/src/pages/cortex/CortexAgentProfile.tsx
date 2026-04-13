import { useMemo } from "react";
import { useParams, useNavigate, useOutletContext } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { agentsApi } from "@/api/agents";
import { issuesApi } from "@/api/issues";
import { queryKeys } from "@/lib/queryKeys";
import { formatCents, relativeTime } from "@/lib/utils";
import { issueToV2Status, cortexStatusStyles } from "@/lib/cortex-status";
import { TopBar } from "@/components/cortex/TopBar";
import { AgentAvatar } from "@/components/cortex/AgentAvatar";
import { PageSkeleton } from "@/components/PageSkeleton";
import { cn } from "@/lib/utils";
import type { CortexStatus } from "@/lib/cortex-status";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In corso", todo: "Da fare", blocked: "Bloccato",
  in_review: "In review", done: "Fatto", cancelled: "Annullato", backlog: "Backlog",
};

const AGENT_STATUS_LABEL: Record<string, string> = {
  active: "Attivo", paused: "In pausa", error: "Errore", terminated: "Terminato",
};

export default function CortexAgentProfile() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { onMobileMenuOpen, onSearchOpen } = useOutletContext<{ onMobileMenuOpen?: () => void; onSearchOpen?: () => void }>();

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => agentsApi.get(agentId!, selectedCompanyId!),
    enabled: !!agentId && !!selectedCompanyId,
  });

  const { data: allIssues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentIssues = useMemo(
    () => (allIssues ?? []).filter((i) => i.assigneeAgentId === agentId),
    [allIssues, agentId],
  );

  const stats = useMemo(() => {
    const active = agentIssues.filter((i) => ["in_progress", "todo", "blocked", "in_review"].includes(i.status)).length;
    const done = agentIssues.filter((i) => i.status === "done").length;
    const blocked = agentIssues.filter((i) => i.status === "blocked" || i.status === "in_review").length;
    return { active, done, blocked, total: agentIssues.length };
  }, [agentIssues]);

  if (isLoading || !agent) return <PageSkeleton variant="dashboard" />;

  const agentStatus: CortexStatus = agent.status === "error" ? "error" : agent.status === "paused" ? "idle" : stats.blocked > 0 ? "needs-me" : stats.active > 0 ? "working" : "done";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#060810] text-white">
      <TopBar
        title={agent.name}
        breadcrumbs={[{ label: "Settings", onClick: () => navigate("../settings") }]}
        onBack={() => navigate("../settings")}
        onMenuOpen={onMobileMenuOpen}
        onSearchOpen={onSearchOpen}
      />

      {/* Agent header */}
      <div className="flex items-start gap-4 border-b border-white/[0.06] px-4 py-5 md:px-7">
        <AgentAvatar name={agent.name} status={agentStatus} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold">{agent.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/45">
            {agent.title && <span>{agent.title}</span>}
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              agent.status === "active" ? "bg-[rgba(110,231,183,0.08)] text-[#6ee7b7]" :
              agent.status === "error" ? "bg-[rgba(252,165,165,0.08)] text-[#fca5a5]" :
              "bg-white/[0.04] text-white/45",
            )}>
              {AGENT_STATUS_LABEL[agent.status] ?? agent.status}
            </span>
            <span className="rounded border border-white/[0.06] bg-[#161a27] px-2 py-0.5 font-mono text-[10px] text-white/40">{agent.adapterType}</span>
          </div>
          {agent.capabilities && (
            <p className="mt-2 text-[12px] leading-[1.5] text-white/45">{agent.capabilities}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2.5 px-4 py-4 sm:grid-cols-4 md:px-7">
        <div className="rounded-lg border border-white/[0.04] bg-[#161a27] px-4 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">Totali</div>
          <div className="mt-1 text-[20px] font-semibold">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-white/[0.04] bg-[#161a27] px-4 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">Attivi</div>
          <div className="mt-1 text-[20px] font-semibold text-[#67e8f9]">{stats.active}</div>
        </div>
        <div className="rounded-lg border border-white/[0.04] bg-[#161a27] px-4 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">Bloccati</div>
          <div className={cn("mt-1 text-[20px] font-semibold", stats.blocked > 0 ? "text-[#fcd34d]" : "text-white/50")}>{stats.blocked}</div>
        </div>
        <div className="rounded-lg border border-white/[0.04] bg-[#161a27] px-4 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">Spesa mese</div>
          <div className="mt-1 text-[20px] font-semibold text-indigo-400">{formatCents(agent.spentMonthlyCents)}</div>
        </div>
      </div>

      {/* Info rows */}
      <div className="border-b border-white/[0.04] px-4 pb-3 md:px-7">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/25">Dettagli</h3>
        <div className="rounded-lg border border-white/[0.04] bg-[#161a27] px-4 py-2">
          {[
            { label: "Ruolo", value: agent.role },
            { label: "Budget mensile", value: agent.budgetMonthlyCents > 0 ? formatCents(agent.budgetMonthlyCents) : "Illimitato" },
            { label: "Ultimo heartbeat", value: agent.lastHeartbeatAt ? relativeTime(agent.lastHeartbeatAt) : "Mai" },
            { label: "Creato", value: new Date(agent.createdAt).toLocaleDateString("it-IT") },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between border-b border-white/[0.02] py-2 last:border-none">
              <span className="text-[12px] text-white/45">{row.label}</span>
              <span className="font-mono text-[12px] text-white/65">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 md:px-7">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/25">Issue assegnate ({agentIssues.length})</h3>
        {agentIssues.length === 0 ? (
          <div className="pt-8 text-center text-[12px] text-white/30">Nessuna issue assegnata</div>
        ) : (
          <div className="space-y-0.5">
            {agentIssues.map((issue) => {
              const status = issueToV2Status(issue.status, {});
              const s = cortexStatusStyles[status];
              return (
                <button
                  key={issue.id}
                  onClick={() => navigate(`../issues/${issue.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <span className="font-mono text-[10px] text-white/35">{issue.identifier ?? "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px]">{issue.title}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-medium", s.bg, s.text)}>
                    {STATUS_LABEL[issue.status] ?? issue.status}
                  </span>
                  <span className="font-mono text-[9px] text-white/25">{relativeTime(issue.updatedAt)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
