import { useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { cn } from "../lib/utils";
import { Identity } from "./Identity";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock,
  FileText, Layers, List, Loader2, RotateCcw, XCircle,
} from "lucide-react";
import type { Issue, Agent } from "@paperclipai/shared";

/* ── Types ──────────────────────────────────── */

interface TreeNode {
  issue: Issue;
  agent: Agent | null;
  department: string;
  children: TreeNode[];
  depth: number;
  x: number;
  y: number;
  width: number;
  isGroup?: boolean;
  groupCount?: number;
  groupStatuses?: Record<string, number>;
  groupIssues?: Issue[];
  isCompact?: boolean;
}

interface TreeEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  blocked: boolean;
  done: boolean;
  active: boolean;
  failed: boolean;
  childIssue: Issue;
}

type ViewMode = "grouped" | "chronological";

/* ── Constants ──────────────────────────────── */

const NODE_W = 200;
const NODE_H = 72;
const COMPACT_W = 140;
const COMPACT_H = 28;
const H_GAP = 20;
const V_GAP = 60;
const COMPACT_V_GAP = 4;
const GROUP_THRESHOLD = 6;
const GROUP_MAX_INDIVIDUAL = 3;

/* ── Department colors ──────────────────────── */

const DEPT_COLORS: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  executive: { border: "border-purple-500/40", bg: "bg-purple-500/[0.06]", text: "text-purple-400", dot: "bg-purple-500" },
  marketing: { border: "border-red-500/40", bg: "bg-red-500/[0.06]", text: "text-red-400", dot: "bg-red-500" },
  creative: { border: "border-emerald-500/40", bg: "bg-emerald-500/[0.06]", text: "text-emerald-400", dot: "bg-emerald-500" },
  research: { border: "border-blue-500/40", bg: "bg-blue-500/[0.06]", text: "text-blue-400", dot: "bg-blue-500" },
  operations: { border: "border-amber-500/40", bg: "bg-amber-500/[0.06]", text: "text-amber-400", dot: "bg-amber-500" },
  general: { border: "border-border", bg: "bg-card/60", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

/* State-override colors — applied over department colors */
const STATE_COLORS = {
  approval: { border: "border-amber-500/50", bg: "bg-amber-500/[0.08]", ring: "ring-amber-500/40" },
  error: { border: "border-red-500/50", bg: "bg-red-500/[0.08]", ring: "ring-red-500/40" },
};

const DEPT_SVG_COLORS: Record<string, string> = {
  executive: "#8b5cf6",
  marketing: "#ef4444",
  creative: "#22c55e",
  research: "#3b82f6",
  operations: "#f59e0b",
  general: "#6b7280",
};

function inferDepartment(role: string | undefined): string {
  if (!role) return "general";
  const r = role.toLowerCase();
  if (r === "ceo") return "executive";
  if (r.includes("market") || r.includes("copy") || r.includes("cmo")) return "marketing";
  if (r.includes("design") || r.includes("cto") || r.includes("creative")) return "creative";
  if (r.includes("research") || r.includes("analyst") || r.includes("pm")) return "research";
  if (r.includes("engineer") || r.includes("email") || r.includes("shopify") || r.includes("dev")) return "operations";
  return "general";
}

/* ── Tree builder ───────────────────────────── */

function buildTree(issues: Issue[], agents: Agent[], viewMode: ViewMode): TreeNode[] {
  const agentMap = new Map<string, Agent>();
  for (const a of agents) agentMap.set(a.id, a);

  const issueMap = new Map<string, Issue>();
  for (const i of issues) issueMap.set(i.id, i);

  // Find root issues that have children (workflow roots)
  const childIds = new Set(issues.filter((i) => i.parentId).map((i) => i.parentId!));
  const roots = issues.filter((i) =>
    !i.parentId && childIds.has(i.id) &&
    (i.status === "in_progress" || i.status === "blocked" || i.status === "todo"),
  );

  // Also include done roots that have non-done children (recently completed workflows)
  const doneRoots = issues.filter((i) =>
    !i.parentId && childIds.has(i.id) && i.status === "done" &&
    issues.some((c) => c.parentId === i.id && c.status !== "done" && c.status !== "cancelled"),
  );

  // Standalone issues: no parent, no children, still active — show as single nodes
  const treeRootIds = new Set([...roots, ...doneRoots].map((i) => i.id));
  const standaloneRoots = issues.filter((i) =>
    !i.parentId && !childIds.has(i.id) && !treeRootIds.has(i.id) &&
    (i.status === "in_progress" || i.status === "blocked" || i.status === "todo" || i.status === "in_review"),
  );

  function buildNode(issue: Issue, depth: number): TreeNode {
    const agent = issue.assigneeAgentId ? agentMap.get(issue.assigneeAgentId) ?? null : null;
    const department = inferDepartment(agent?.role);

    let children: TreeNode[];
    if (viewMode === "chronological") {
      // Sort by identifier number (chronological activation order)
      children = issues
        .filter((i) => i.parentId === issue.id)
        .sort((a, b) => {
          const aNum = parseInt(a.identifier?.split("-")[1] ?? "0", 10);
          const bNum = parseInt(b.identifier?.split("-")[1] ?? "0", 10);
          return aNum - bNum;
        })
        .map((child) => buildNode(child, depth + 1));
    } else {
      // Grouped: sort by agent name, then identifier
      children = issues
        .filter((i) => i.parentId === issue.id)
        .sort((a, b) => {
          const aAgent = a.assigneeAgentId ? agentMap.get(a.assigneeAgentId)?.name ?? "" : "";
          const bAgent = b.assigneeAgentId ? agentMap.get(b.assigneeAgentId)?.name ?? "" : "";
          if (aAgent !== bAgent) return aAgent.localeCompare(bAgent);
          const aNum = parseInt(a.identifier?.split("-")[1] ?? "0", 10);
          const bNum = parseInt(b.identifier?.split("-")[1] ?? "0", 10);
          return aNum - bNum;
        })
        .map((child) => buildNode(child, depth + 1));
    }

    return { issue, agent, department, children, depth, x: 0, y: 0, width: 0 };
  }

  return [...roots, ...doneRoots, ...standaloneRoots].map((root) => buildNode(root, 0));
}

/* ── Layout algorithm ───────────────────────── */

function layoutTree(root: TreeNode): { root: TreeNode; totalWidth: number; totalHeight: number; compactNodes: TreeNode[] } {
  // Separate completed children into compact lane
  const compactNodes: TreeNode[] = [];
  separateCompactNodes(root, compactNodes);

  // Group large children sets by agent
  groupChildren(root);

  // Pass 1: measure widths bottom-up
  measureWidth(root);

  // Pass 2: assign positions top-down (leave space on left for compact lane)
  const compactLaneWidth = compactNodes.length > 0 ? COMPACT_W + 20 : 0;
  assignPositions(root, compactLaneWidth);

  // Layout compact nodes in left lane
  let compactY = root.y;
  for (const cn of compactNodes) {
    cn.x = 0;
    cn.y = compactY;
    cn.width = COMPACT_W;
    compactY += COMPACT_H + COMPACT_V_GAP;
  }

  // Calculate total bounds
  let maxX = 0;
  let maxY = 0;
  function traverse(node: TreeNode) {
    maxX = Math.max(maxX, node.x + NODE_W);
    maxY = Math.max(maxY, node.y + NODE_H);
    for (const child of node.children) traverse(child);
  }
  traverse(root);

  for (const cn of compactNodes) {
    maxY = Math.max(maxY, cn.y + COMPACT_H);
  }

  return { root, totalWidth: maxX + 40, totalHeight: maxY + 40, compactNodes };
}

function separateCompactNodes(node: TreeNode, compactNodes: TreeNode[]) {
  // Move done/cancelled children to compact lane
  const active: TreeNode[] = [];
  for (const child of node.children) {
    const s = child.issue.status;
    if ((s === "done" || s === "cancelled") && child.children.length === 0) {
      compactNodes.push({ ...child, isCompact: true });
    } else {
      active.push(child);
    }
  }
  node.children = active;

  // Recurse
  for (const child of node.children) {
    separateCompactNodes(child, compactNodes);
  }
}

function groupChildren(node: TreeNode) {
  if (node.children.length > GROUP_THRESHOLD) {
    // Group by agent
    const byAgent = new Map<string, TreeNode[]>();
    for (const child of node.children) {
      const key = child.issue.assigneeAgentId ?? "__none__";
      if (!byAgent.has(key)) byAgent.set(key, []);
      byAgent.get(key)!.push(child);
    }

    const newChildren: TreeNode[] = [];
    for (const [, group] of byAgent) {
      if (group.length <= GROUP_MAX_INDIVIDUAL) {
        newChildren.push(...group);
      } else {
        // Create a group node from the first issue
        const representative = group[0];
        const statuses: Record<string, number> = {};
        for (const g of group) {
          statuses[g.issue.status] = (statuses[g.issue.status] || 0) + 1;
        }
        newChildren.push({
          ...representative,
          isGroup: true,
          groupCount: group.length,
          groupStatuses: statuses,
          groupIssues: group.map((g) => g.issue),
          children: [],
          width: 0,
        });
      }
    }
    node.children = newChildren;
  }

  // Recurse
  for (const child of node.children) {
    groupChildren(child);
  }
}

function measureWidth(node: TreeNode): number {
  if (node.children.length === 0) {
    node.width = NODE_W;
    return NODE_W;
  }
  const childWidths = node.children.map((c) => measureWidth(c));
  node.width = childWidths.reduce((sum, w) => sum + w, 0) + H_GAP * (node.children.length - 1);
  node.width = Math.max(node.width, NODE_W);
  return node.width;
}

function assignPositions(node: TreeNode, startX: number) {
  // Center node within its allocated width
  node.x = startX + (node.width - NODE_W) / 2;
  node.y = node.depth * (NODE_H + V_GAP);

  let childStartX = startX;
  for (const child of node.children) {
    assignPositions(child, childStartX);
    childStartX += child.width + H_GAP;
  }
}

/* ── Edge builder ───────────────────────────── */

function buildEdges(root: TreeNode, failedIssueIds: Set<string>): TreeEdge[] {
  const edges: TreeEdge[] = [];

  function traverse(node: TreeNode) {
    for (const child of node.children) {
      edges.push({
        fromX: node.x + NODE_W / 2,
        fromY: node.y + NODE_H,
        toX: child.x + NODE_W / 2,
        toY: child.y,
        blocked: child.issue.status === "blocked",
        done: child.issue.status === "done" || child.issue.status === "cancelled",
        active: child.issue.status === "in_progress",
        failed: failedIssueIds.has(child.issue.id),
        childIssue: child.issue,
      });
      traverse(child);
    }
  }
  traverse(root);
  return edges;
}

/* ── Status icon helper ─────────────────────── */

function StatusDot({ status, hasFailed }: { status: string; hasFailed?: boolean }) {
  if (hasFailed) return <AlertTriangle className="h-3 w-3 text-red-500" />;
  if (status === "done") return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
  if (status === "blocked") return <AlertCircle className="h-3 w-3 text-amber-500 animate-pulse" />;
  if (status === "in_progress") return <Loader2 className="h-3 w-3 text-cyan-400 animate-spin" />;
  if (status === "cancelled") return <XCircle className="h-3 w-3 text-muted-foreground" />;
  if (status === "todo") return <Clock className="h-3 w-3 text-muted-foreground/50" />;
  return <Clock className="h-3 w-3 text-muted-foreground/30" />;
}

const STATUS_LABELS: Record<string, string> = {
  done: "Completata",
  blocked: "Da approvare",
  in_progress: "In corso",
  cancelled: "Annullata",
  todo: "Da fare",
  in_review: "In revisione",
  backlog: "Backlog",
};

/* ── SVG Connector ──────────────────────────── */

function ConnectorPath({
  edge,
  onBlockedClick,
}: {
  edge: TreeEdge;
  onBlockedClick?: (issue: Issue) => void;
}) {
  const midY = (edge.fromY + edge.toY) / 2;
  const path = `M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${midY}, ${edge.toX} ${midY}, ${edge.toX} ${edge.toY}`;

  const strokeColor = edge.failed
    ? "#ef4444"
    : edge.blocked
      ? "#f59e0b"
      : edge.done
        ? "rgba(255,255,255,0.06)"
        : edge.active
          ? "#22d3ee"
          : "rgba(255,255,255,0.15)";

  const midX = (edge.fromX + edge.toX) / 2;

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={edge.blocked || edge.failed ? 2.5 : 2}
        strokeDasharray={edge.active ? "6 4" : "none"}
        className={edge.active ? "animate-[dash-flow_1.5s_linear_infinite]" : ""}
      />
      {/* Blocked = amber approval indicator */}
      {edge.blocked && !edge.failed && (
        <g
          className="cursor-pointer"
          onClick={() => onBlockedClick?.(edge.childIssue)}
        >
          <circle cx={midX} cy={midY} r={10} fill="#f59e0b" opacity={0.2} className="animate-ping" />
          <circle cx={midX} cy={midY} r={8} fill="#d97706" stroke="#fcd34d" strokeWidth={1.5} />
          <text x={midX} y={midY + 1} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="9" fontWeight="bold">?</text>
        </g>
      )}
      {/* Failed = red error indicator */}
      {edge.failed && (
        <g
          className="cursor-pointer"
          onClick={() => onBlockedClick?.(edge.childIssue)}
        >
          <circle cx={midX} cy={midY} r={10} fill="#ef4444" opacity={0.2} className="animate-ping" />
          <circle cx={midX} cy={midY} r={8} fill="#dc2626" stroke="#fca5a5" strokeWidth={1.5} />
          <text x={midX} y={midY + 1} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="9" fontWeight="bold">!</text>
        </g>
      )}
    </g>
  );
}

/* ── Compact Node (left lane) ─────────────── */

function CompactNodeCard({ node }: { node: TreeNode }) {
  const isDone = node.issue.status === "done";
  const tagMatch = node.issue.title.match(/\[([^\]]+)\]/);
  const tag = tagMatch ? tagMatch[1] : null;
  const cleanTitle = node.issue.title.replace(/\[[^\]]+\]\s*/, "");

  return (
    <Link
      to={`/issues/${node.issue.identifier ?? node.issue.id}`}
      className={cn(
        "absolute rounded border px-2 py-1 no-underline text-inherit block",
        "hover:ring-1 hover:ring-white/10 transition-all",
        "border-border/30 bg-card/30 opacity-50 hover:opacity-80",
      )}
      style={{ left: node.x, top: node.y, width: COMPACT_W, height: COMPACT_H }}
    >
      <div className="flex items-center gap-1 h-full">
        {isDone
          ? <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
          : <XCircle className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
        }
        {tag && <span className="text-[8px] font-mono text-muted-foreground shrink-0">{tag}</span>}
        <span className="text-[9px] truncate text-muted-foreground">{cleanTitle}</span>
      </div>
    </Link>
  );
}

/* ── Node Card ──────────────────────────────── */

function NodeCard({
  node,
  onGroupClick,
  failedIssueIds,
}: {
  node: TreeNode;
  onGroupClick?: (node: TreeNode) => void;
  failedIssueIds: Set<string>;
}) {
  const colors = DEPT_COLORS[node.department] ?? DEPT_COLORS.general;
  const isBlocked = node.issue.status === "blocked";
  const hasFailed = failedIssueIds.has(node.issue.id);
  const isDone = node.issue.status === "done" || node.issue.status === "cancelled";

  // State-based overrides
  const stateOverride = hasFailed
    ? STATE_COLORS.error
    : isBlocked
      ? STATE_COLORS.approval
      : null;

  // Extract workflow tag like [W1.1]
  const tagMatch = node.issue.title.match(/\[([^\]]+)\]/);
  const tag = tagMatch ? tagMatch[1] : null;
  const cleanTitle = node.issue.title.replace(/\[[^\]]+\]\s*/, "");

  if (node.isGroup) {
    // Check if any issue in the group has a failure
    const groupHasFailure = node.groupIssues?.some((i) => failedIssueIds.has(i.id));
    const groupHasBlocked = node.groupIssues?.some((i) => i.status === "blocked");

    const groupOverride = groupHasFailure
      ? STATE_COLORS.error
      : groupHasBlocked
        ? STATE_COLORS.approval
        : null;

    return (
      <button
        type="button"
        onClick={() => onGroupClick?.(node)}
        className={cn(
          "absolute rounded-lg border-l-[3px] px-3 py-2 text-left",
          "cursor-pointer hover:ring-1 hover:ring-white/10 transition-all",
          groupOverride ? groupOverride.border : colors.border,
          groupOverride ? groupOverride.bg : colors.bg,
          "border border-border/40",
          groupOverride && `ring-1 ${groupOverride.ring}`,
        )}
        style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          {node.agent && <Identity name={node.agent.name} size="xs" />}
          <span className="text-xs font-medium truncate">{node.agent?.name ?? "Agenti"}</span>
          <span className="text-[10px] text-muted-foreground">({node.groupCount})</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
        </div>
        {/* Mini status bar */}
        <div className="flex gap-0.5 h-2 rounded-full overflow-hidden mt-1">
          {node.groupStatuses && Object.entries(node.groupStatuses).map(([status, count]) => {
            const total = Object.values(node.groupStatuses!).reduce((s, c) => s + c, 0);
            const pct = (count / total) * 100;
            const color = status === "done" ? "bg-emerald-500"
              : status === "blocked" ? "bg-amber-500"
              : status === "in_progress" ? "bg-cyan-400"
              : status === "cancelled" ? "bg-muted-foreground/30"
              : "bg-muted-foreground/20";
            return <div key={status} className={cn("h-full", color)} style={{ width: `${pct}%` }} />;
          })}
        </div>
      </button>
    );
  }

  return (
    <Link
      to={`/issues/${node.issue.identifier ?? node.issue.id}`}
      className={cn(
        "absolute rounded-lg border-l-[3px] px-3 py-2 no-underline text-inherit block",
        "hover:ring-1 hover:ring-white/10 transition-all",
        stateOverride ? stateOverride.border : colors.border,
        stateOverride ? stateOverride.bg : colors.bg,
        "border border-border/40",
        stateOverride && `ring-1 ${stateOverride.ring}`,
        isBlocked && !hasFailed && "animate-[pulse-blocked_2s_ease-in-out_infinite]",
        hasFailed && "animate-[pulse-blocked_1.5s_ease-in-out_infinite]",
        isDone && !hasFailed && "opacity-50",
      )}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
    >
      {/* Row 1: identifier + tag */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <StatusDot status={node.issue.status} hasFailed={hasFailed} />
        <span className="text-[10px] font-mono text-muted-foreground">{node.issue.identifier}</span>
        {tag && <span className={cn("text-[10px] font-medium", stateOverride ? (hasFailed ? "text-red-400" : "text-amber-400") : colors.text)}>{tag}</span>}
      </div>
      {/* Row 2: title */}
      <p className="text-xs font-medium truncate leading-tight">{cleanTitle}</p>
      {/* Row 3: agent + status */}
      <div className="flex items-center justify-between mt-1">
        {node.agent && (
          <span className="text-[10px] text-muted-foreground truncate">
            {node.agent.name}
          </span>
        )}
        <span className={cn(
          "text-[9px] font-medium px-1 py-0.5 rounded",
          hasFailed ? "bg-red-500/20 text-red-400" :
          isBlocked ? "bg-amber-500/20 text-amber-400" :
          node.issue.status === "in_progress" ? "bg-cyan-500/20 text-cyan-400" :
          isDone ? "bg-emerald-500/20 text-emerald-400" :
          "bg-muted text-muted-foreground",
        )}>
          {hasFailed ? "Errore" : STATUS_LABELS[node.issue.status] ?? node.issue.status}
        </span>
      </div>
    </Link>
  );
}

/* ── Group Popover ─────────────────────────── */

function GroupPopover({
  node,
  onClose,
  failedIssueIds,
}: {
  node: TreeNode;
  onClose: () => void;
  failedIssueIds: Set<string>;
}) {
  const colors = DEPT_COLORS[node.department] ?? DEPT_COLORS.general;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg p-4 shadow-xl max-w-sm w-full mx-4 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          {node.agent && <Identity name={node.agent.name} size="sm" />}
          <span className="text-sm font-medium">{node.agent?.name ?? "Agenti"}</span>
          <span className="text-xs text-muted-foreground">({node.groupCount} issue)</span>
        </div>
        {node.groupIssues?.map((issue) => {
          const hasFailed = failedIssueIds.has(issue.id);
          const tagMatch = issue.title.match(/\[([^\]]+)\]/);
          const tag = tagMatch ? tagMatch[1] : null;
          const cleanTitle = issue.title.replace(/\[[^\]]+\]\s*/, "");
          return (
            <Link
              key={issue.id}
              to={`/issues/${issue.identifier ?? issue.id}`}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm no-underline text-inherit",
                "hover:bg-white/5 transition-colors border",
                hasFailed ? "border-red-500/30 bg-red-500/[0.03]"
                : issue.status === "blocked" ? "border-amber-500/30 bg-amber-500/[0.03]"
                : "border-border/40",
              )}
              onClick={onClose}
            >
              <StatusDot status={issue.status} hasFailed={hasFailed} />
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">{issue.identifier}</span>
              {tag && <span className={cn("text-[10px] font-medium shrink-0", colors.text)}>{tag}</span>}
              <span className="text-xs truncate">{cleanTitle}</span>
              <span className={cn(
                "text-[9px] font-medium px-1 py-0.5 rounded ml-auto shrink-0",
                hasFailed ? "bg-red-500/20 text-red-400" :
                issue.status === "done" ? "bg-emerald-500/20 text-emerald-400" :
                issue.status === "blocked" ? "bg-amber-500/20 text-amber-400" :
                issue.status === "in_progress" ? "bg-cyan-500/20 text-cyan-400" :
                "bg-muted text-muted-foreground",
              )}>
                {hasFailed ? "Errore" : STATUS_LABELS[issue.status] ?? issue.status}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Approval/Error Popover ───────────────────────── */

function BlockedPopover({
  issue,
  agents,
  onClose,
  hasFailed,
  failedError,
}: {
  issue: Issue;
  agents: Agent[];
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRevision: () => void;
  isPending: boolean;
  hasFailed: boolean;
  failedError?: string;
}) {
  const agent = issue.assigneeAgentId ? agents.find((a) => a.id === issue.assigneeAgentId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className={cn(
          "bg-card border rounded-lg p-4 shadow-xl max-w-sm w-full mx-4 space-y-3",
          hasFailed ? "border-red-500/30" : "border-amber-500/30",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {hasFailed
            ? <AlertTriangle className="h-4 w-4 text-red-500" />
            : <AlertCircle className="h-4 w-4 text-amber-500" />
          }
          <span className="text-sm font-medium">
            {hasFailed ? "Errore nell'esecuzione" : "Approvazione richiesta"}
          </span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            {issue.identifier && <span className="font-mono mr-1">{issue.identifier}</span>}
            {issue.title}
          </p>
          {agent && (
            <p className="text-xs text-muted-foreground">
              {hasFailed ? "Assegnata a" : "Completata da"} <span className="font-medium text-foreground">{agent.name}</span>
            </p>
          )}
          {hasFailed && failedError && (
            <p className="text-[11px] text-red-400 mt-2 px-2 py-1.5 rounded bg-red-500/10 font-mono">
              {failedError}
            </p>
          )}
        </div>
        <Link
          to={`/issues/${issue.identifier ?? issue.id}`}
          className={cn(
            "inline-flex items-center justify-center w-full h-8 rounded-md text-xs font-medium text-white transition-colors",
            hasFailed ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700",
          )}
        >
          {hasFailed
            ? <><AlertTriangle className="h-3 w-3 mr-1.5" /> Visualizza dettagli</>
            : <><CheckCircle2 className="h-3 w-3 mr-1.5" /> Rivedi e approva</>
          }
        </Link>
      </div>
    </div>
  );
}

/* ── Legend ──────────────────────────────────── */

function Legend() {
  const items = [
    { color: "bg-amber-500", label: "Da approvare" },
    { color: "bg-red-500", label: "Errore" },
    { color: "bg-cyan-400", label: "In corso" },
    { color: "bg-emerald-500", label: "Completata" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
      {items.map(({ color, label }) => (
        <span key={label} className="flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-full", color)} />
          {label}
        </span>
      ))}
    </div>
  );
}

/* ── View toggle ────────────────────────────── */

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border/50 bg-card/50 p-0.5">
      <button
        type="button"
        onClick={() => onChange("grouped")}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors",
          mode === "grouped" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Layers className="h-3 w-3" />
        Per agente
      </button>
      <button
        type="button"
        onClick={() => onChange("chronological")}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors",
          mode === "chronological" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <List className="h-3 w-3" />
        Cronologico
      </button>
    </div>
  );
}

/* ── Main component ─────────────────────────── */

export function WorkflowGraph({
  issues,
  agents,
  onApprove,
  onReject,
  onRevision,
  isPending,
  failedIssueIds = new Set(),
  failedIssueErrors = new Map(),
}: {
  issues: Issue[];
  agents: Agent[];
  onApprove: (issueId: string) => void;
  onReject: (issueId: string) => void;
  onRevision: (issueId: string) => void;
  isPending: boolean;
  failedIssueIds?: Set<string>;
  failedIssueErrors?: Map<string, string>;
}) {
  const [blockedIssue, setBlockedIssue] = useState<Issue | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<TreeNode | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("chronological");

  const trees = useMemo(() => buildTree(issues, agents, viewMode), [issues, agents, viewMode]);
  const layouts = useMemo(() => trees.map((t) => layoutTree(t)), [trees]);

  if (trees.length === 0) return null;

  return (
    <div className="space-y-4">
      {layouts.map(({ root, totalWidth, totalHeight, compactNodes }, idx) => {
        const edges = buildEdges(root, failedIssueIds);
        const nodes: TreeNode[] = [];
        function collectNodes(node: TreeNode) {
          nodes.push(node);
          for (const child of node.children) collectNodes(child);
        }
        collectNodes(root);

        return (
          <div key={root.issue.id} className="rounded-xl border border-border bg-[#0c0e14] p-4 overflow-x-auto">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {root.issue.identifier && <span className="text-muted-foreground mr-1.5">{root.issue.identifier}</span>}
                  {root.issue.title}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <ViewToggle mode={viewMode} onChange={setViewMode} />
                <Legend />
              </div>
            </div>

            <div className="relative" style={{ width: totalWidth, height: totalHeight, minWidth: "100%" }}>
              {/* Compact lane label */}
              {compactNodes.length > 0 && (
                <div className="absolute text-[9px] text-muted-foreground/50 uppercase tracking-wider font-medium"
                     style={{ left: 0, top: root.y - 16 }}>
                  Completati ({compactNodes.length})
                </div>
              )}

              {/* Compact nodes in left lane */}
              {compactNodes.map((cn) => (
                <CompactNodeCard key={cn.issue.id} node={cn} />
              ))}

              {/* SVG connectors layer */}
              <svg
                className="absolute inset-0 pointer-events-none"
                width={totalWidth}
                height={totalHeight}
                style={{ overflow: "visible" }}
              >
                <defs>
                  <style>{`
                    @keyframes dash-flow {
                      to { stroke-dashoffset: -20; }
                    }
                  `}</style>
                </defs>
                {edges.map((edge, i) => (
                  <g key={i} style={{ pointerEvents: edge.blocked || edge.failed ? "auto" : "none" }}>
                    <ConnectorPath
                      edge={edge}
                      onBlockedClick={(issue) => setBlockedIssue(issue)}
                    />
                  </g>
                ))}
              </svg>

              {/* HTML node cards */}
              {nodes.map((node) => (
                <NodeCard
                  key={node.issue.id}
                  node={node}
                  onGroupClick={setExpandedGroup}
                  failedIssueIds={failedIssueIds}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Group expand popover */}
      {expandedGroup && (
        <GroupPopover
          node={expandedGroup}
          onClose={() => setExpandedGroup(null)}
          failedIssueIds={failedIssueIds}
        />
      )}

      {/* Blocked/failed issue popover */}
      {blockedIssue && (
        <BlockedPopover
          issue={blockedIssue}
          agents={agents}
          onClose={() => setBlockedIssue(null)}
          onApprove={() => {
            onApprove(blockedIssue.id);
            setBlockedIssue(null);
          }}
          onReject={() => {
            onReject(blockedIssue.id);
            setBlockedIssue(null);
          }}
          onRevision={() => {
            onRevision(blockedIssue.id);
            setBlockedIssue(null);
          }}
          isPending={isPending}
          hasFailed={failedIssueIds.has(blockedIssue.id)}
          failedError={failedIssueErrors.get(blockedIssue.id)}
        />
      )}
    </div>
  );
}
