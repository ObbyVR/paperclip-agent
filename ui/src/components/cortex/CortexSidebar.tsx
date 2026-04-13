import { useState, useMemo } from "react";
import { NavLink } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/CompanyContext";
import { projectsApi } from "@/api/projects";
import { issuesApi } from "@/api/issues";
import { queryKeys } from "@/lib/queryKeys";
import {
  ChevronDown,
  ChevronLeft,
  CircleDot,
  DollarSign,
  Inbox,
  Monitor,
  Settings,
  Sun,
} from "lucide-react";

interface CortexSidebarProps {
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function CortexSidebar({ selectedProjectId, onSelectProject, mobileOpen, onMobileClose }: CortexSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(true);
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

  const activeProjects = useMemo(
    () => (projects ?? []).filter((p) => !p.archivedAt),
    [projects],
  );

  const projectStats = useMemo(() => {
    const counts = new Map<string, number>();
    const blocked = new Map<string, boolean>();
    for (const issue of issues ?? []) {
      if (!issue.projectId) continue;
      const active = ["in_progress", "todo", "blocked", "in_review"].includes(issue.status);
      if (active) counts.set(issue.projectId, (counts.get(issue.projectId) ?? 0) + 1);
      if (issue.status === "blocked" || issue.status === "in_review") {
        blocked.set(issue.projectId, true);
      }
    }
    return { counts, blocked };
  }, [issues]);

  const inboxUrgent = useMemo(() => {
    return (issues ?? []).filter((i) => i.status === "blocked" || i.status === "in_review").length;
  }, [issues]);

  return (
    <>
    {/* Mobile backdrop */}
    {mobileOpen && (
      <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onMobileClose} />
    )}
    <nav
      className={cn(
        "flex flex-col border-r border-white/[0.06] bg-[#0b0d15] transition-[width,transform] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
        // Desktop: inline, collapsible
        "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[260px] max-md:shadow-[4px_0_24px_rgba(0,0,0,0.6)]",
        mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        // Desktop widths
        "md:relative",
        collapsed ? "md:w-[52px]" : "md:w-[220px]",
      )}
    >
      {/* Brand */}
      <div className={cn("flex items-center gap-2.5 px-[18px] pt-[18px] pb-3.5 mb-1", collapsed && "justify-center px-0")}>
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-[0_2px_12px_rgba(99,102,241,0.25)]">
          <span className="text-xs font-bold text-white">C</span>
        </div>
        {!collapsed && (
          <span className="text-[16px] font-semibold tracking-[-0.02em]">Cortex</span>
        )}
      </div>

      {/* Main nav */}
      <div className="py-1">
        {[
          { to: "/cortex/dashboard", label: "Dashboard", Icon: Sun },
          { to: "/cortex/inbox", label: "Inbox", Icon: Inbox, badge: inboxUrgent > 0 ? inboxUrgent : undefined },
          { to: "/cortex/issues", label: "Issues", Icon: CircleDot },
          { to: "/cortex/office", label: "Pixel Office", Icon: Monitor },
          { to: "/cortex/costs", label: "Costs", Icon: DollarSign },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onMobileClose}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 border-l-2 border-transparent px-[18px] py-2 text-[13px] font-medium text-white/70 transition-all duration-100",
                "hover:bg-white/[0.04] hover:text-white",
                isActive && "border-l-indigo-400 bg-indigo-400/[0.12] text-white",
                collapsed && "justify-center px-0 relative",
              )
            }
          >
            <item.Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="flex-1">{item.label}</span>}
            {item.badge != null && (
              <span className={cn(
                "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#fcd34d] px-1 text-[10px] font-bold text-[#0b0d15]",
                collapsed && "absolute -right-0.5 -top-0.5 h-[14px] min-w-[14px] text-[8px]",
              )}>
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </div>

      {/* Projects submenu */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto border-t border-white/[0.06] pt-1">
          <button
            onClick={() => setProjectsOpen(!projectsOpen)}
            className="flex w-full items-center gap-1.5 px-[18px] py-2 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/25 transition-colors hover:text-white/40"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform duration-150", !projectsOpen && "-rotate-90")} />
            Progetti
          </button>

          {projectsOpen && (
            <div className="pb-2">
              {activeProjects.map((project) => {
                const isActive = selectedProjectId === project.id;
                const count = projectStats.counts.get(project.id) ?? 0;
                const hasAlert = projectStats.blocked.get(project.id) ?? false;

                return (
                  <button
                    key={project.id}
                    onClick={() => onSelectProject(isActive ? null : project.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-[22px] py-[6px] text-left transition-all duration-100",
                      "hover:bg-white/[0.04]",
                      isActive && "bg-indigo-400/[0.08]",
                    )}
                  >
                    <div
                      className="h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{ backgroundColor: project.color ?? "#6366f1" }}
                    />
                    <span className={cn(
                      "flex-1 truncate text-[12px]",
                      isActive ? "font-semibold text-white" : "text-white/50",
                    )}>
                      {project.name}
                    </span>
                    {hasAlert && (
                      <div className="h-[5px] w-[5px] animate-pulse rounded-full bg-[#fcd34d] shadow-[0_0_6px_rgba(252,211,77,0.5)]" />
                    )}
                    {!hasAlert && count > 0 && (
                      <span className="font-mono text-[10px] text-white/35">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Spacer when collapsed */}
      {collapsed && <div className="flex-1" />}

      {/* Config */}
      <div className="border-t border-white/[0.06] py-1.5">
        {!collapsed && (
          <div className="px-[18px] pb-1 pt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/25">
            Config
          </div>
        )}
        <NavLink
          to="/cortex/settings"
          onClick={onMobileClose}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 px-[18px] py-2 text-[13px] font-medium text-white/70 transition-all hover:bg-white/[0.04] hover:text-white",
              isActive && "border-l-2 border-l-indigo-400 bg-indigo-400/[0.12] text-white",
              collapsed && "justify-center px-0",
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
      </div>

      {/* Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "flex items-center gap-2 border-t border-white/[0.06] px-[18px] py-3.5 text-[11px] text-white/25 transition-colors hover:text-white/45",
          collapsed && "justify-center px-0",
        )}
      >
        <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform duration-200", collapsed && "rotate-180")} />
        {!collapsed && <span>Comprimi</span>}
      </button>
    </nav>
    </>
  );
}
