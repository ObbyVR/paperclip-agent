import { useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { cn } from "../lib/utils";
import { Identity } from "./Identity";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock,
  FileText, Loader2, RotateCcw, XCircle,
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
}

interface TreeEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  blocked: boolean;
  done: boolean;
  active: boolean;
  childIssue: Issue;
}

/* ── Constants ──────────────────────────────── */

const NODE_W = 200;
const NODE_H = 72;
const H_GAP = 20;
const V_GAP = 60;
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

function buildTree(issues: Issue[], agents: Agent[]): TreeNode[] {
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

  function buildNode(issue: Issue, depth: number): TreeNode {
    const agent = issue.assigneeAgentId ? agentMap.get(issue.assigneeAgentId) ?? null : null;
    const department = inferDepartment(agent?.role);
    const children = issues
      .filter((i) => i.parentId === issue.id)
      .sort((a, b) => {
        // Sort by identifier number (WEB-56 < WEB-57)
        const aNum = parseInt(a.identifier?.split("-")[1] ?? "0", 10);
        const bNum = parseInt(b.identifier?.split("-")[1] ?? "0", 10);
        return aNum - bNum;
      })
      .map((child) => buildNode(child, depth + 1));

    return { issue, agent, department, children, depth, x: 0, y: 0, width: 0 };
  }

  return [...roots, ...doneRoots].map((root) => buildNode(root, 0));
}

/* ── Layout algorithm ───────────────────────── */

function layoutTree(root: TreeNode): { root: TreeNode; totalWidth: number; totalHeight: number } {
  // Group large children sets by agent
  groupChildren(root);

  // Pass 1: measure widths bottom-up
  measureWidth(root);

  // Pass 2: assign positions top-down
  assignPositions(root, 0);

  // Calculate total bounds
  let maxX = 0;
  let maxY = 0;
  function traverse(node: TreeNode) {
    maxX = Math.max(maxX, node.x + NODE_W);
    maxY = Math.max(maxY, node.y + NODE_H);
    for (const child of node.children) traverse(child);
  }
  traverse(root);

  return { root, totalWidth: maxX + 40, totalHeight: maxY + 40 };
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

function buildEdges(root: TreeNode): TreeEdge[] {
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
        childIssue: child.issue,
      });
      traverse(child);
    }
  }
  traverse(root);
  return edges;
}

/* ── Status icon helper ─────────────────────── */

function StatusDot({ status }: { status: string }) {
  if (status === "done") return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
  if (status === "blocked") return <AlertCircle className="h-3 w-3 text-red-500 animate-pulse" />;
  if (status === "in_progress") return <Loader2 className="h-3 w-3 text-cyan-400 animate-spin" />;
  if (status === "cancelled") return <XCircle className="h-3 w-3 text-muted-foreground" />;
  if (status === "todo") return <Clock className="h-3 w-3 text-muted-foreground/50" />;
  return <Clock className="h-3 w-3 text-muted-foreground/30" />;
}

const STATUS_LABELS: Record<string, string> = {
  done: "Completata",
  blocked: "Bloccata",
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

  const strokeColor = edge.blocked
    ? "#ef4444"
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
        strokeWidth={edge.blocked ? 2.5 : 2}
        strokeDasharray={edge.active ? "6 4" : edge.blocked ? "none" : "none"}
        className={edge.active ? "animate-[dash-flow_1.5s_linear_infinite]" : ""}
      />
      {edge.blocked && (
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

/* ── Node Card ──────────────────────────────── */

function NodeCard({ node }: { node: TreeNode }) {
  const colors = DEPT_COLORS[node.department] ?? DEPT_COLORS.general;
  const isBlocked = node.issue.status === "blocked";
  const isDone = node.issue.status === "done" || node.issue.status === "cancelled";

  // Extract workflow tag like [W1.1]
  const tagMatch = node.issue.title.match(/\[([^\]]+)\]/);
  const tag = tagMatch ? tagMatch[1] : null;
  const cleanTitle = node.issue.title.replace(/\[[^\]]+\]\s*/, "");

  if (node.isGroup) {
    return (
      <div
        className={cn(
          "absolute rounded-lg border-l-[3px] px-3 py-2",
          colors.border, colors.bg,
          "border border-border/40",
        )}
        style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          {node.agent && <Identity name={node.agent.name} size="xs" />}
          <span className="text-xs font-medium truncate">{node.agent?.name ?? "Agenti"}</span>
          <span className="text-[10px] text-muted-foreground">({node.groupCount})</span>
        </div>
        {/* Mini status bar */}
        <div className="flex gap-0.5 h-2 rounded-full overflow-hidden mt-1">
          {node.groupStatuses && Object.entries(node.groupStatuses).map(([status, count]) => {
            const total = Object.values(node.groupStatuses!).reduce((s, c) => s + c, 0);
            const pct = (count / total) * 100;
            const color = status === "done" ? "bg-emerald-500"
              : status === "blocked" ? "bg-red-500"
              : status === "in_progress" ? "bg-cyan-400"
              : status === "cancelled" ? "bg-muted-foreground/30"
              : "bg-muted-foreground/20";
            return <div key={status} className={cn("h-full", color)} style={{ width: `${pct}%` }} />;
          })}
        </div>
      </div>
    );
  }

  return (
    <Link
      to={`/issues/${node.issue.identifier ?? node.issue.id}`}
      className={cn(
        "absolute rounded-lg border-l-[3px] px-3 py-2 no-underline text-inherit block",
        "hover:ring-1 hover:ring-white/10 transition-all",
        colors.border, colors.bg,
        "border border-border/40",
        isBlocked && "ring-1 ring-red-500/50 animate-[pulse-blocked_2s_ease-in-out_infinite]",
        isDone && "opacity-50",
      )}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
    >
      {/* Row 1: identifier + tag */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <StatusDot status={node.issue.status} />
        <span className="text-[10px] font-mono text-muted-foreground">{node.issue.identifier}</span>
        {tag && <span className={cn("text-[10px] font-medium", colors.text)}>{tag}</span>}
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
          isBlocked ? "bg-red-500/20 text-red-400" :
          node.issue.status === "in_progress" ? "bg-cyan-500/20 text-cyan-400" :
          isDone ? "bg-emerald-500/20 text-emerald-400" :
          "bg-muted text-muted-foreground",
        )}>
          {STATUS_LABELS[node.issue.status] ?? node.issue.status}
        </span>
      </div>
    </Link>
  );
}

/* ── Approval Popover ───────────────────────── */

function BlockedPopover({
  issue,
  agents,
  onClose,
  onApprove,
  onReject,
  onRevision,
  isPending,
}: {
  issue: Issue;
  agents: Agent[];
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRevision: () => void;
  isPending: boolean;
}) {
  const agent = issue.assigneeAgentId ? agents.find((a) => a.id === issue.assigneeAgentId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-card border border-red-500/30 rounded-lg p-4 shadow-xl max-w-sm w-full mx-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-sm font-medium">Approvazione richiesta</span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            {issue.identifier && <span className="font-mono mr-1">{issue.identifier}</span>}
            {issue.title}
          </p>
          {agent && (
            <p className="text-xs text-muted-foreground">
              Completata da <span className="font-medium text-foreground">{agent.name}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
            onClick={onApprove}
            disabled={isPending}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approva
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
            onClick={onRevision}
            disabled={isPending}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Revisione
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
            onClick={onReject}
            disabled={isPending}
          >
            <XCircle className="h-3 w-3 mr-1" />
            Rifiuta
          </Button>
        </div>
        <Link
          to={`/issues/${issue.identifier ?? issue.id}`}
          className="text-[11px] text-blue-400 hover:underline block"
        >
          Apri issue completa
        </Link>
      </div>
    </div>
  );
}

/* ── Legend ──────────────────────────────────── */

function Legend() {
  const depts = [
    { key: "executive", label: "CEO" },
    { key: "marketing", label: "Marketing" },
    { key: "creative", label: "Creativo" },
    { key: "research", label: "Ricerca" },
    { key: "operations", label: "Operazioni" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
      {depts.map(({ key, label }) => (
        <span key={key} className="flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-full", DEPT_COLORS[key]?.dot)} />
          {label}
        </span>
      ))}
      <span className="text-muted-foreground/30">|</span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        Bloccata (clicca per approvare)
      </span>
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
}: {
  issues: Issue[];
  agents: Agent[];
  onApprove: (issueId: string) => void;
  onReject: (issueId: string) => void;
  onRevision: (issueId: string) => void;
  isPending: boolean;
}) {
  const [blockedIssue, setBlockedIssue] = useState<Issue | null>(null);

  const trees = useMemo(() => buildTree(issues, agents), [issues, agents]);
  const layouts = useMemo(() => trees.map((t) => layoutTree(t)), [trees]);

  if (trees.length === 0) return null;

  return (
    <div className="space-y-4">
      {layouts.map(({ root, totalWidth, totalHeight }, idx) => {
        const edges = buildEdges(root);
        const nodes: TreeNode[] = [];
        function collectNodes(node: TreeNode) {
          nodes.push(node);
          for (const child of node.children) collectNodes(child);
        }
        collectNodes(root);

        return (
          <div key={root.issue.id} className="rounded-xl border border-border bg-[#0c0e14] p-4 overflow-x-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {root.issue.identifier && <span className="text-muted-foreground mr-1.5">{root.issue.identifier}</span>}
                  {root.issue.title}
                </span>
              </div>
              <Legend />
            </div>

            <div className="relative" style={{ width: totalWidth, height: totalHeight, minWidth: "100%" }}>
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
                  <g key={i} style={{ pointerEvents: edge.blocked ? "auto" : "none" }}>
                    <ConnectorPath
                      edge={edge}
                      onBlockedClick={(issue) => setBlockedIssue(issue)}
                    />
                  </g>
                ))}
              </svg>

              {/* HTML node cards */}
              {nodes.map((node) => (
                <NodeCard key={node.issue.id} node={node} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Blocked issue approval popover */}
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
        />
      )}
    </div>
  );
}
