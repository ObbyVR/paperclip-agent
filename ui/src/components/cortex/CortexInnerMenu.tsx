import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/CompanyContext";
import { projectsApi } from "@/api/projects";
import { issuesApi } from "@/api/issues";
import { queryKeys } from "@/lib/queryKeys";

interface CortexInnerMenuProps {
  collapsed: boolean;
  onToggle: () => void;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
}

export function CortexInnerMenu({ collapsed, onToggle, selectedProjectId, onSelectProject }: CortexInnerMenuProps) {
  const { selectedCompanyId } = useCompany();

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const projectStats = useMemo(() => {
    const counts = new Map<string, number>();
    const blocked = new Map<string, boolean>();
    for (const issue of issues ?? []) {
      if (!issue.projectId) continue;
      counts.set(issue.projectId, (counts.get(issue.projectId) ?? 0) + 1);
      if (issue.status === "blocked" || issue.status === "in_review") {
        blocked.set(issue.projectId, true);
      }
    }
    return { counts, blocked };
  }, [issues]);

  const activeProjects = useMemo(
    () => (projects ?? []).filter((p) => !p.archivedAt),
    [projects],
  );

  return (
    <div
      className={cn(
        "flex flex-col border-r border-white/[0.03] bg-[#0b0d15] transition-all duration-200",
        collapsed ? "w-0 overflow-hidden border-none opacity-0 pointer-events-none" : "w-[200px]",
      )}
    >
      <div className="flex items-center justify-between border-b border-white/[0.03] px-4 pb-3 pt-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/30">
          Progetti
        </h3>
        <button
          onClick={onToggle}
          className="flex h-[22px] w-[22px] items-center justify-center rounded-md text-white/30 transition-all hover:bg-white/[0.06] hover:text-white/55"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeProjects.map((project) => {
          const isActive = selectedProjectId === project.id;
          const count = projectStats.counts.get(project.id) ?? 0;
          const hasAlert = projectStats.blocked.get(project.id) ?? false;

          return (
            <button
              key={project.id}
              onClick={() => onSelectProject(isActive ? null : project.id)}
              className={cn(
                "flex w-full items-center gap-2.5 border-l-2 border-transparent px-4 py-2.5 text-left transition-all duration-100",
                "hover:bg-white/[0.025]",
                isActive && "border-l-indigo-400 bg-indigo-400/[0.06]",
              )}
            >
              <div
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ backgroundColor: project.color ?? "#6366f1" }}
              />
              <span className="flex-1 truncate text-[12.5px] font-medium">{project.name}</span>
              {hasAlert && (
                <div className="h-[5px] w-[5px] animate-pulse rounded-full bg-[#fcd34d] shadow-[0_0_6px_rgba(252,211,77,0.5)]" />
              )}
              {!hasAlert && count > 0 && (
                <span className="text-[10px] font-mono text-white/30">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
