import { useMemo } from "react";
import { useOutletContext } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { agentsApi } from "@/api/agents";
import { projectsApi } from "@/api/projects";
import { queryKeys } from "@/lib/queryKeys";
import { TopBar } from "@/components/cortex/TopBar";
import { AgentAvatar } from "@/components/cortex/AgentAvatar";
import { PageSkeleton } from "@/components/PageSkeleton";
import { cn } from "@/lib/utils";

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/35">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.02] py-2.5">
      <span className="text-[12.5px] text-white/50">{label}</span>
      <span className="font-mono text-[12.5px] text-white/70">{value}</span>
    </div>
  );
}

export default function CortexSettings() {
  const { onMobileMenuOpen, onSearchOpen } = useOutletContext<{ onMobileMenuOpen?: () => void; onSearchOpen?: () => void }>();
  const { selectedCompanyId, selectedCompany } = useCompany();

  const { data: agents, isLoading } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const activeAgents = useMemo(() => (agents ?? []).filter((a) => a.status !== "terminated"), [agents]);
  const activeProjects = useMemo(() => (projects ?? []).filter((p) => !p.archivedAt), [projects]);

  if (isLoading) return <PageSkeleton variant="dashboard" />;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#060810] text-white">
      <TopBar title="Settings" onMenuOpen={onMobileMenuOpen} onSearchOpen={onSearchOpen} />

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
        <SettingsSection title="Azienda">
          <div className="rounded-xl border border-white/[0.04] bg-[#161a27] px-4 py-3 md:px-5 md:py-4">
            <InfoRow label="Nome" value={selectedCompany?.name ?? "—"} />
            <InfoRow label="Prefisso" value={selectedCompany?.issuePrefix ?? "—"} />
            <InfoRow label="Agenti attivi" value={String(activeAgents.length)} />
            <InfoRow label="Progetti attivi" value={String(activeProjects.length)} />
          </div>
        </SettingsSection>

        <SettingsSection title={`Agenti (${activeAgents.length})`}>
          <div className="space-y-1">
            {activeAgents.map((agent) => (
              <div key={agent.id} className="flex items-center gap-2.5 rounded-lg border border-white/[0.02] bg-[#161a27] px-3 py-2.5 md:gap-3 md:px-4 md:py-3">
                <AgentAvatar name={agent.name} status={agent.status === "error" ? "error" : "idle"} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium md:text-[12.5px]">{agent.name}</div>
                  {agent.title && <div className="text-[10px] text-white/45">{agent.title}</div>}
                </div>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-medium sm:px-2.5 sm:text-[10px]",
                  agent.status === "active" ? "bg-[rgba(110,231,183,0.08)] text-[#6ee7b7]" :
                  agent.status === "error" ? "bg-[rgba(252,165,165,0.08)] text-[#fca5a5]" :
                  agent.status === "paused" ? "bg-[rgba(252,211,77,0.08)] text-[#fcd34d]" :
                  "bg-white/[0.04] text-white/45",
                )}>
                  {agent.status}
                </span>
                <span className="hidden font-mono text-[10px] text-white/35 sm:block">{agent.adapterType}</span>
              </div>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection title={`Progetti (${activeProjects.length})`}>
          <div className="space-y-1">
            {activeProjects.map((project) => (
              <div key={project.id} className="flex items-center gap-2.5 rounded-lg border border-white/[0.02] bg-[#161a27] px-3 py-2.5 md:gap-3 md:px-4 md:py-3">
                <div className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ backgroundColor: project.color ?? "#6366f1" }} />
                <span className="flex-1 truncate text-[12px] font-medium md:text-[12.5px]">{project.name}</span>
                <span className={cn(
                  "rounded-full px-2.5 py-0.5 text-[10px] font-medium",
                  project.status === "in_progress" ? "bg-[rgba(103,232,249,0.08)] text-[#67e8f9]" :
                  "bg-white/[0.04] text-white/45",
                )}>
                  {project.status}
                </span>
              </div>
            ))}
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
