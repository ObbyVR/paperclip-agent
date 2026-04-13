import { useMemo } from "react";
import { useOutletContext } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { agentsApi } from "@/api/agents";
import { dashboardApi } from "@/api/dashboard";
import { queryKeys } from "@/lib/queryKeys";
import { formatCents } from "@/lib/utils";
import { TopBar } from "@/components/cortex/TopBar";
import { AgentAvatar } from "@/components/cortex/AgentAvatar";
import { PageSkeleton } from "@/components/PageSkeleton";
import { cn } from "@/lib/utils";

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cn(
      "flex flex-col gap-1 rounded-xl border border-white/[0.04] px-5 py-4",
      accent ? "bg-indigo-400/[0.06]" : "bg-[#161a27]",
    )}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/35">{label}</span>
      <span className={cn("text-[22px] font-semibold tracking-tight", accent ? "text-indigo-400" : "text-white")}>{value}</span>
      {sub && <span className="text-[11px] text-white/45">{sub}</span>}
    </div>
  );
}

function BudgetRing({ percent, label, value, sub }: { percent: number; label: string; value: string; sub?: string }) {
  const r = 32;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(percent, 100) / 100) * circ;
  const color = percent > 90 ? "#fca5a5" : percent > 70 ? "#fcd34d" : "#818cf8";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-[#161a27] px-4 py-3">
      <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="5" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 36 36)"
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
        <text x="36" y="38" textAnchor="middle" className="fill-white text-[13px] font-semibold">{percent.toFixed(0)}%</text>
      </svg>
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/35">{label}</span>
        <span className="text-[18px] font-semibold text-white">{value}</span>
        {sub && <span className="text-[11px] text-white/45">{sub}</span>}
      </div>
    </div>
  );
}

export default function CortexCosts() {
  const { onMobileMenuOpen, onSearchOpen } = useOutletContext<{ onMobileMenuOpen?: () => void; onSearchOpen?: () => void }>();
  const { selectedCompanyId } = useCompany();

  const { data: summary, isLoading } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentCosts = useMemo(() => {
    if (!agents) return [];
    return [...agents]
      .filter((a) => a.spentMonthlyCents > 0)
      .sort((a, b) => b.spentMonthlyCents - a.spentMonthlyCents);
  }, [agents]);

  const totalSpend = summary?.costs?.monthSpendCents ?? 0;
  const budget = summary?.costs?.monthBudgetCents ?? 0;
  const utilization = summary?.costs?.monthUtilizationPercent ?? 0;

  if (isLoading) return <PageSkeleton variant="dashboard" />;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#060810] text-white">
      <TopBar
        title="Costi"
        onMenuOpen={onMobileMenuOpen}
        onSearchOpen={onSearchOpen}
        kpis={[
          { value: formatCents(totalSpend), label: "spesa mese" },
          { value: budget > 0 ? formatCents(budget) : "Illimitato", label: "budget" },
          { value: `${utilization.toFixed(0)}%`, label: "utilizzo" },
        ]}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-2.5 px-4 pt-4 pb-2 sm:grid-cols-3 sm:gap-3 md:px-6 md:pt-5">
        <StatCard label="Spesa mese corrente" value={formatCents(totalSpend)} accent />
        <BudgetRing
          percent={utilization}
          label="Budget mensile"
          value={budget > 0 ? formatCents(budget) : "Aperto"}
          sub={budget > 0 ? undefined : "Nessun cap configurato"}
        />
        <StatCard
          label="Agenti attivi"
          value={String(summary?.agents?.active ?? 0)}
          sub={`${summary?.agents?.running ?? 0} in esecuzione`}
        />
      </div>

      {/* Agent cost breakdown */}
      <div className="px-4 pt-4 pb-2 md:px-6 md:pt-5">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/35">
          Spesa per agente
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 md:px-6">
        {agentCosts.length > 0 ? (
          <div className="space-y-1">
            {agentCosts.map((agent) => {
              const pct = totalSpend > 0 ? (agent.spentMonthlyCents / totalSpend) * 100 : 0;
              return (
                <div key={agent.id} className="flex items-center gap-2.5 rounded-lg border border-white/[0.02] bg-[#161a27] px-3 py-2.5 md:gap-3 md:px-4 md:py-3">
                  <AgentAvatar name={agent.name} status="working" size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium md:text-[12.5px]">{agent.name}</div>
                    {/* Progress bar */}
                    <div className="mt-1.5 h-[3px] w-full rounded-full bg-white/[0.04]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[12px] font-semibold text-white md:text-[13px]">
                      {formatCents(agent.spentMonthlyCents)}
                    </div>
                    <div className="font-mono text-[10px] text-white/35">{pct.toFixed(1)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 pt-20 text-white/35">
            <span className="text-[32px]">💰</span>
            <span className="text-[12px]">Nessuna spesa questo mese</span>
          </div>
        )}
      </div>
    </div>
  );
}
