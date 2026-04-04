import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { cn, agentRouteRef, agentUrl } from "../lib/utils";
import { useAgentOrder } from "../hooks/useAgentOrder";
import { AgentIcon } from "./AgentIconPicker";
import { BudgetSidebarMarker } from "./BudgetSidebarMarker";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Agent } from "@paperclipai/shared";

/** A department group: leader agent + their direct reports (which may themselves be sub-departments) */
interface DepartmentGroup {
  leader: Agent;
  /** Direct reports that are NOT sub-department leaders */
  members: Agent[];
  /** Direct reports that ARE sub-department leaders (have their own reports) */
  subDepartments: DepartmentGroup[];
}

/** Build department groups from reportsTo hierarchy (recursive) */
function buildDepartmentGroups(agents: Agent[]): {
  ceo: Agent | null;
  departments: DepartmentGroup[];
  standalone: Agent[];
} {
  const agentById = new Map<string, Agent>();
  for (const a of agents) agentById.set(a.id, a);

  // Build direct reports map
  const directReports = new Map<string, Agent[]>();
  for (const a of agents) {
    if (a.reportsTo && agentById.has(a.reportsTo)) {
      const list = directReports.get(a.reportsTo) ?? [];
      list.push(a);
      directReports.set(a.reportsTo, list);
    }
  }

  // Recursively build a department for an agent that has reports
  function buildDept(leader: Agent): DepartmentGroup {
    const reports = directReports.get(leader.id) ?? [];
    const subDepartments: DepartmentGroup[] = [];
    const members: Agent[] = [];

    for (const report of reports) {
      const hasOwnReports = (directReports.get(report.id) ?? []).length > 0;
      if (hasOwnReports) {
        subDepartments.push(buildDept(report));
      } else {
        members.push(report);
      }
    }

    return { leader, members, subDepartments };
  }

  // Find the CEO (top of the chain)
  const ceoAgent = agents.find(
    (a) => !a.reportsTo || !agentById.has(a.reportsTo),
  );

  if (!ceoAgent) {
    return { ceo: null, departments: [], standalone: agents };
  }

  // Build departments from CEO's direct reports
  const ceoReports = directReports.get(ceoAgent.id) ?? [];
  const departments: DepartmentGroup[] = [];
  const standalone: Agent[] = [];

  for (const report of ceoReports) {
    const hasOwnReports = (directReports.get(report.id) ?? []).length > 0;
    if (hasOwnReports) {
      departments.push(buildDept(report));
    } else {
      standalone.push(report);
    }
  }

  // Any agents not reachable from CEO
  const reachable = new Set<string>();
  function markReachable(id: string) {
    reachable.add(id);
    for (const r of directReports.get(id) ?? []) markReachable(r.id);
  }
  markReachable(ceoAgent.id);
  const orphans = agents.filter((a) => !reachable.has(a.id));
  standalone.push(...orphans);

  return { ceo: ceoAgent, departments, standalone };
}

function AgentNavItem({
  agent,
  activeAgentId,
  activeTab,
  runCount,
  isMobile,
  setSidebarOpen,
  indent = false,
}: {
  agent: Agent;
  activeAgentId: string | null;
  activeTab: string | null;
  runCount: number;
  isMobile: boolean;
  setSidebarOpen: (open: boolean) => void;
  indent?: boolean;
}) {
  return (
    <NavLink
      key={agent.id}
      to={activeTab ? `${agentUrl(agent)}/${activeTab}` : agentUrl(agent)}
      onClick={() => {
        if (isMobile) setSidebarOpen(false);
      }}
      className={cn(
        "flex items-center gap-2.5 py-1.5 text-[13px] font-medium transition-colors",
        indent ? "pl-7 pr-3" : "px-3",
        activeAgentId === agentRouteRef(agent)
          ? "bg-accent text-foreground"
          : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <AgentIcon icon={agent.icon} className="shrink-0 h-3.5 w-3.5 text-muted-foreground" />
      <span className="flex-1 truncate">{agent.name}</span>
      {(agent.pauseReason === "budget" || runCount > 0) && (
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {agent.pauseReason === "budget" ? (
            <BudgetSidebarMarker title="Budget paused" />
          ) : null}
          {runCount > 0 ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                {runCount} live
              </span>
            </>
          ) : null}
        </span>
      )}
    </NavLink>
  );
}

export function SidebarAgents() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const { selectedCompanyId } = useCompany();
  const { openNewAgent } = useDialog();
  const { isMobile, setSidebarOpen } = useSidebar();
  const location = useLocation();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const liveCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of liveRuns ?? []) {
      if (run.status === "running" || run.status === "queued") {
        counts.set(run.agentId, (counts.get(run.agentId) ?? 0) + 1);
      }
    }
    return counts;
  }, [liveRuns]);

  const visibleAgents = useMemo(() => {
    const filtered = (agents ?? []).filter(
      (a: Agent) => a.status !== "terminated",
    );
    return filtered;
  }, [agents]);
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const { orderedAgents } = useAgentOrder({
    agents: visibleAgents,
    companyId: selectedCompanyId,
    userId: currentUserId,
  });

  const agentMatch = location.pathname.match(/^\/(?:[^/]+\/)?agents\/([^/]+)(?:\/([^/]+))?/);
  const activeAgentId = agentMatch?.[1] ?? null;
  const activeTab = agentMatch?.[2] ?? null;

  // Build department hierarchy
  const { ceo, departments, standalone } = useMemo(
    () => buildDepartmentGroups(orderedAgents),
    [orderedAgents],
  );

  const hasDepartments = departments.length > 0;

  const navProps = { activeAgentId, activeTab, isMobile, setSidebarOpen };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="group">
        <div className="flex items-center px-3 py-1.5">
          <CollapsibleTrigger className="flex items-center gap-1 flex-1 min-w-0">
            <ChevronRight
              className={cn(
                "h-3 w-3 text-muted-foreground/60 transition-transform opacity-0 group-hover:opacity-100",
                open && "rotate-90",
              )}
            />
            <span className="text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
              {t("nav.agents")}
            </span>
          </CollapsibleTrigger>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openNewAgent();
            }}
            className="flex items-center justify-center h-4 w-4 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label={t("agent.newAgent")}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 mt-0.5">
          {hasDepartments ? (
            <>
              {/* CEO at the top */}
              {ceo && (
                <AgentNavItem
                  key={ceo.id}
                  agent={ceo}
                  runCount={liveCountByAgent.get(ceo.id) ?? 0}
                  {...navProps}
                />
              )}

              {/* Department groups */}
              {departments.map((dept) => (
                <DepartmentSection
                  key={dept.leader.id}
                  department={dept}
                  liveCountByAgent={liveCountByAgent}
                  {...navProps}
                />
              ))}

              {/* Standalone agents that report directly to CEO but have no reports */}
              {standalone.length > 0 && (
                <>
                  {standalone.map((agent) => (
                    <AgentNavItem
                      key={agent.id}
                      agent={agent}
                      runCount={liveCountByAgent.get(agent.id) ?? 0}
                      {...navProps}
                    />
                  ))}
                </>
              )}
            </>
          ) : (
            /* Flat list fallback when no reportsTo hierarchy exists */
            orderedAgents.map((agent: Agent) => (
              <AgentNavItem
                key={agent.id}
                agent={agent}
                runCount={liveCountByAgent.get(agent.id) ?? 0}
                {...navProps}
              />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Count all agents in a department recursively */
function countDeptAgents(dept: DepartmentGroup): number {
  let count = 1 + dept.members.length; // leader + direct members
  for (const sub of dept.subDepartments) count += countDeptAgents(sub);
  return count;
}

/** Collapsible department section with leader + indented members + sub-departments */
function DepartmentSection({
  department,
  liveCountByAgent,
  activeAgentId,
  activeTab,
  isMobile,
  setSidebarOpen,
}: {
  department: DepartmentGroup;
  liveCountByAgent: Map<string, number>;
  activeAgentId: string | null;
  activeTab: string | null;
  isMobile: boolean;
  setSidebarOpen: (open: boolean) => void;
}) {
  const [deptOpen, setDeptOpen] = useState(true);
  const { leader, members, subDepartments } = department;
  const totalCount = countDeptAgents(department);
  const navProps = { activeAgentId, activeTab, isMobile, setSidebarOpen };

  return (
    <Collapsible open={deptOpen} onOpenChange={setDeptOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center gap-1 px-3 py-1 mt-1">
          <ChevronRight
            className={cn(
              "h-2.5 w-2.5 text-muted-foreground/50 transition-transform",
              deptOpen && "rotate-90",
            )}
          />
          <AgentIcon icon={leader.icon} className="shrink-0 h-3 w-3 text-muted-foreground/60" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 truncate flex-1 text-left">
            {leader.title ?? leader.name}
          </span>
          <span className="text-[10px] text-muted-foreground/40 shrink-0">
            {totalCount}
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {/* Leader */}
        <AgentNavItem
          agent={leader}
          runCount={liveCountByAgent.get(leader.id) ?? 0}
          indent
          {...navProps}
        />
        {/* Sub-departments (leaders with their own reports) */}
        {subDepartments.map((subDept) => (
          <SubDepartmentSection
            key={subDept.leader.id}
            department={subDept}
            liveCountByAgent={liveCountByAgent}
            {...navProps}
          />
        ))}
        {/* Direct members (no reports of their own) */}
        {members.map((agent) => (
          <AgentNavItem
            key={agent.id}
            agent={agent}
            runCount={liveCountByAgent.get(agent.id) ?? 0}
            indent
            {...navProps}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Nested sub-department (deeper indent) */
function SubDepartmentSection({
  department,
  liveCountByAgent,
  activeAgentId,
  activeTab,
  isMobile,
  setSidebarOpen,
}: {
  department: DepartmentGroup;
  liveCountByAgent: Map<string, number>;
  activeAgentId: string | null;
  activeTab: string | null;
  isMobile: boolean;
  setSidebarOpen: (open: boolean) => void;
}) {
  const [subOpen, setSubOpen] = useState(true);
  const { leader, members } = department;
  const navProps = { activeAgentId, activeTab, isMobile, setSidebarOpen };

  return (
    <Collapsible open={subOpen} onOpenChange={setSubOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center gap-1 pl-7 pr-3 py-0.5">
          <ChevronRight
            className={cn(
              "h-2 w-2 text-muted-foreground/40 transition-transform",
              subOpen && "rotate-90",
            )}
          />
          <span className="text-[10px] text-muted-foreground/50 truncate flex-1 text-left">
            {leader.title ?? leader.name}
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <AgentNavItem
          agent={leader}
          runCount={liveCountByAgent.get(leader.id) ?? 0}
          indent
          {...navProps}
        />
        {members.map((agent) => (
          <AgentNavItem
            key={agent.id}
            agent={agent}
            runCount={liveCountByAgent.get(agent.id) ?? 0}
            indent
            {...navProps}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
