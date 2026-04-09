import type { Agent } from "@paperclipai/shared";

/** A department group: leader agent + their direct reports */
export interface DepartmentGroup {
  leader: Agent;
  /** Direct reports that are NOT sub-department leaders */
  members: Agent[];
  /** Direct reports that ARE sub-department leaders (have their own reports) */
  subDepartments: DepartmentGroup[];
}

/** Build department groups from reportsTo hierarchy (recursive) */
export function buildDepartmentGroups(agents: Agent[]): {
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

/** Flatten a department group into all agents (leader + members + sub-dept agents) */
export function flattenDepartment(dept: DepartmentGroup): Agent[] {
  const all: Agent[] = [dept.leader, ...dept.members];
  for (const sub of dept.subDepartments) {
    all.push(...flattenDepartment(sub));
  }
  return all;
}

/** Get a color theme for a department based on the leader's role */
export function getDeptTheme(leaderRole: string): { wall: string; accent: string; floor: string } {
  switch (leaderRole) {
    case "designer":
      return { wall: "#2a1a2a", accent: "#d946ef", floor: "#1e1220" };
    case "engineer":
    case "cto":
    case "devops":
      return { wall: "#0f1a2a", accent: "#3b82f6", floor: "#0a1220" };
    case "ecommerce":
      return { wall: "#2a1a1a", accent: "#f97316", floor: "#1e1210" };
    case "cmo":
    case "pm":
      return { wall: "#1a2a1a", accent: "#22c55e", floor: "#121e12" };
    case "researcher":
      return { wall: "#2a2a1a", accent: "#eab308", floor: "#1e1e12" };
    case "cfo":
      return { wall: "#1a2a2a", accent: "#06b6d4", floor: "#121e1e" };
    default:
      return { wall: "#1a1a2a", accent: "#8b5cf6", floor: "#12121e" };
  }
}
