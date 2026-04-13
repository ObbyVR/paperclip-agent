# CEO Console Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 19-page Paperclip UI with a 5-page "CEO Console" focused on decision-making, using a radial network graph and Telegram-style chat interaction mask.

**Architecture:** New pages in `ui/src/pages/v2/` alongside existing pages. V2 routes registered under `/:companyPrefix/v2/*` with a shared V2Layout. Reuses existing API layer, contexts, and query infrastructure. New components for the graph, interaction mask, and simplified inbox.

**Tech Stack:** React 19 + TypeScript + Tailwind 4 (oklch custom props) + shadcn/ui + TanStack Query + Lucide icons + DiceBear avatars

**Spec:** `docs/superpowers/specs/2026-04-13-ceo-console-redesign.md`
**Prototype:** `ui/prototypes/ceo-console-v3.html`

---

## File Structure

### New Files to Create

```
ui/src/
├── pages/v2/
│   ├── V2Dashboard.tsx          — Dashboard page: topbar + graph + mask host
│   ├── V2Inbox.tsx              — Inbox page: 3-section scroll (Urgente/In corso/Archivio)
│   └── V2Layout.tsx             — Layout shell: V2Sidebar + InnerMenu + content + mask
├── components/v2/
│   ├── V2Sidebar.tsx            — Collapsible sidebar (5 nav items + config)
│   ├── InnerMenu.tsx            — Collapsible project/context selector panel
│   ├── NetworkGraph.tsx         — Radial CEO-centric agent graph (SVG + positioned nodes)
│   ├── AgentNode.tsx            — Single agent node (avatar, name, role, task, status)
│   ├── CeoNode.tsx              — Center CEO node with breathing rings
│   ├── GraphLines.tsx           — SVG connection lines with animated particles
│   ├── InteractionMask.tsx      — Slide-in panel shell (header + request + tabs + actions)
│   ├── MaskChat.tsx             — Telegram-style chat tab with output cards
│   ├── MaskDetails.tsx          — Details tab (unlocks, subtasks, metrics)
│   ├── MaskFiles.tsx            — Files tab (shared outputs/documents list)
│   ├── OutputPreviewCard.tsx    — Inline preview card for HTML/site outputs in chat
│   ├── FilePill.tsx             — Inline file attachment pill in chat messages
│   ├── InboxSection.tsx         — Single inbox section (header + item list)
│   ├── InboxItem.tsx            — Single inbox row (avatar, message, time, action)
│   ├── TopBar.tsx               — Discrete KPI bar for dashboard/inbox headers
│   └── AgentAvatar.tsx          — DiceBear avatar wrapper with status indicator
└── lib/
    └── v2-status.ts             — Unified 4-state status mapping (working/needs-me/done/error/idle)
```

### Existing Files to Modify

```
ui/src/App.tsx                   — Add v2 route group under /:companyPrefix/v2/*
ui/src/components/Sidebar.tsx    — Add "Try new UI" link to existing sidebar (optional)
```

---

## Task 1: Status Mapping Utility

**Files:**
- Create: `ui/src/lib/v2-status.ts`

This is the foundation — maps Paperclip's 7+ issue statuses and various agent/run/approval statuses into 5 unified visual states.

- [ ] **Step 1: Create the status mapping module**

```typescript
// ui/src/lib/v2-status.ts

export type V2Status = "working" | "needs-me" | "done" | "error" | "idle";

/** Tailwind classes for each unified status */
export const v2StatusStyles: Record<V2Status, {
  border: string;
  bg: string;
  dot: string;
  text: string;
  glow: string;
  lineClass: string;
}> = {
  working: {
    border: "border-[#67e8f9]",
    bg: "bg-[rgba(103,232,249,0.08)]",
    dot: "bg-[#67e8f9]",
    text: "text-[#67e8f9]",
    glow: "shadow-[0_0_16px_rgba(103,232,249,0.15)]",
    lineClass: "live",
  },
  "needs-me": {
    border: "border-[#fcd34d]",
    bg: "bg-[rgba(252,211,77,0.08)]",
    dot: "bg-[#fcd34d]",
    text: "text-[#fcd34d]",
    glow: "shadow-[0_0_16px_rgba(252,211,77,0.15)]",
    lineClass: "alert",
  },
  done: {
    border: "border-[#6ee7b7]",
    bg: "bg-[rgba(110,231,183,0.08)]",
    dot: "bg-[#6ee7b7]",
    text: "text-[#6ee7b7]",
    glow: "",
    lineClass: "done",
  },
  error: {
    border: "border-[#fca5a5]",
    bg: "bg-[rgba(252,165,165,0.08)]",
    dot: "bg-[#fca5a5]",
    text: "text-[#fca5a5]",
    glow: "shadow-[0_0_16px_rgba(252,165,165,0.15)]",
    lineClass: "error",
  },
  idle: {
    border: "border-white/10",
    bg: "bg-transparent",
    dot: "",
    text: "text-white/30",
    glow: "",
    lineClass: "idle",
  },
};

/** Map an issue status string to a V2Status */
export function issueToV2Status(
  issueStatus: string,
  opts?: { isUnread?: boolean; hasLiveRun?: boolean },
): V2Status {
  if (opts?.hasLiveRun) return "working";

  switch (issueStatus) {
    case "blocked":
    case "in_review":
      return "needs-me";
    case "in_progress":
    case "todo":
      return "working";
    case "done":
      return opts?.isUnread ? "needs-me" : "done";
    case "cancelled":
      return "done";
    case "backlog":
    default:
      return "idle";
  }
}

/** Map an agent's aggregate state to V2Status based on their active issues */
export function agentToV2Status(
  agentStatus: string,
  opts?: { hasBlockedIssues?: boolean; hasLiveRun?: boolean },
): V2Status {
  if (opts?.hasBlockedIssues) return "needs-me";
  if (opts?.hasLiveRun) return "working";

  switch (agentStatus) {
    case "running":
    case "active":
      return "working";
    case "error":
      return "error";
    case "paused":
    case "idle":
    case "archived":
    default:
      return "idle";
  }
}

/** Status dot icon content */
export function v2StatusIcon(status: V2Status): string | null {
  switch (status) {
    case "needs-me": return "!";
    case "done": return "✓";
    case "error": return "!";
    default: return null;
  }
}

/** Whether the status dot should pulse */
export function v2StatusPulses(status: V2Status): boolean {
  return status === "working" || status === "error";
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
export PATH="$HOME/local-node/bin:$PATH"
cd /Users/valeriorullo/Downloads/GitHub/paperclip
pnpm --filter @paperclipai/ui exec tsc --noEmit --pretty 2>&1 | tail -5
```
Expected: No errors related to v2-status.ts

- [ ] **Step 3: Commit**

```bash
git add ui/src/lib/v2-status.ts
git commit -m "feat(v2): add unified status mapping for CEO Console"
```

---

## Task 2: V2Sidebar Component

**Files:**
- Create: `ui/src/components/v2/V2Sidebar.tsx`

Collapsible sidebar with 5 nav items. Follows existing SidebarNavItem patterns but with simplified markup.

- [ ] **Step 1: Create the V2Sidebar component**

```typescript
// ui/src/components/v2/V2Sidebar.tsx
import { useState } from "react";
import { NavLink } from "@/lib/router";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  CircleDot,
  DollarSign,
  Inbox,
  Monitor,
  Settings,
  Sun,
} from "lucide-react";

interface V2SidebarProps {
  className?: string;
}

const NAV_ITEMS = [
  { to: "/v2/dashboard", label: "Dashboard", icon: Sun },
  { to: "/v2/inbox", label: "Inbox", icon: Inbox, badgeKey: "inbox" as const },
  { to: "/issues", label: "Issues", icon: CircleDot },
  { to: "/pixel-office", label: "Pixel Office", icon: Monitor },
  { to: "/costs", label: "Costs", icon: DollarSign },
] as const;

export function V2Sidebar({ className }: V2SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav
      className={cn(
        "flex flex-col border-r border-white/[0.03] bg-[#0b0d15] transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
        collapsed ? "w-[52px]" : "w-[208px]",
        className,
      )}
    >
      {/* Brand */}
      <div className={cn("flex items-center gap-2.5 px-[18px] pt-[18px] pb-3.5 mb-1", collapsed && "justify-center px-0")}>
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-[0_2px_12px_rgba(99,102,241,0.25)]">
          <span className="text-xs font-bold text-white">P</span>
        </div>
        {!collapsed && (
          <span className="text-[16px] font-semibold tracking-[-0.02em] font-['Outfit',sans-serif]">
            Paperclip
          </span>
        )}
      </div>

      {/* Main nav */}
      <div className="flex-1 py-1.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 border-l-2 border-transparent px-[18px] py-2 text-[13px] font-medium text-white/55 transition-all duration-100",
                "hover:bg-white/[0.03] hover:text-white/90",
                isActive && "border-l-indigo-400 bg-indigo-400/[0.12] text-white",
                collapsed && "justify-center px-0",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </div>

      {/* Config section */}
      <div className="border-t border-white/[0.03] py-1.5">
        {!collapsed && (
          <div className="px-[18px] pb-1 pt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/[0.15]">
            Config
          </div>
        )}
        <NavLink
          to="/instance/settings"
          className={cn(
            "flex items-center gap-2.5 px-[18px] py-2 text-[13px] font-medium text-white/55 transition-all hover:bg-white/[0.03] hover:text-white/90",
            collapsed && "justify-center px-0",
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "flex items-center gap-2 border-t border-white/[0.03] px-[18px] py-3.5 text-[11px] text-white/[0.15] transition-colors hover:text-white/30",
          collapsed && "justify-center px-0",
        )}
      >
        <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform duration-200", collapsed && "rotate-180")} />
        {!collapsed && <span>Comprimi</span>}
      </button>
    </nav>
  );
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
export PATH="$HOME/local-node/bin:$PATH"
cd /Users/valeriorullo/Downloads/GitHub/paperclip
pnpm --filter @paperclipai/ui exec tsc --noEmit --pretty 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/v2/V2Sidebar.tsx
git commit -m "feat(v2): add V2Sidebar component"
```

---

## Task 3: InnerMenu Component

**Files:**
- Create: `ui/src/components/v2/InnerMenu.tsx`

Collapsible project selector panel that sits between sidebar and content.

- [ ] **Step 1: Create InnerMenu component**

```typescript
// ui/src/components/v2/InnerMenu.tsx
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/CompanyContext";
import { projectsApi } from "@/api/projects";
import { issuesApi } from "@/api/issues";
import { queryKeys } from "@/lib/queryKeys";

interface InnerMenuProps {
  collapsed: boolean;
  onToggle: () => void;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
}

export function InnerMenu({ collapsed, onToggle, selectedProjectId, onSelectProject }: InnerMenuProps) {
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

  // Count issues per project
  const projectIssueCounts = new Map<string, number>();
  const projectHasBlocked = new Map<string, boolean>();
  for (const issue of issues ?? []) {
    if (!issue.projectId) continue;
    projectIssueCounts.set(issue.projectId, (projectIssueCounts.get(issue.projectId) ?? 0) + 1);
    if (issue.status === "blocked" || issue.status === "in_review") {
      projectHasBlocked.set(issue.projectId, true);
    }
  }

  const activeProjects = (projects ?? []).filter((p) => !p.archivedAt);

  return (
    <div
      className={cn(
        "flex flex-col border-r border-white/[0.03] bg-[#0b0d15] transition-all duration-200",
        collapsed ? "w-0 overflow-hidden border-none opacity-0 pointer-events-none" : "w-[200px]",
      )}
    >
      <div className="flex items-center justify-between border-b border-white/[0.03] px-4 pb-3 pt-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/30 font-['Outfit',sans-serif]">
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
          const count = projectIssueCounts.get(project.id) ?? 0;
          const hasAlert = projectHasBlocked.get(project.id) ?? false;

          return (
            <button
              key={project.id}
              onClick={() => onSelectProject(project.id)}
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
                <div className="h-[5px] w-[5px] rounded-full bg-[#fcd34d] shadow-[0_0_6px_rgba(252,211,77,0.5)] animate-pulse" />
              )}
              {!hasAlert && count > 0 && (
                <span className="text-[10px] text-white/30 font-['JetBrains_Mono',monospace]">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
export PATH="$HOME/local-node/bin:$PATH"
cd /Users/valeriorullo/Downloads/GitHub/paperclip
pnpm --filter @paperclipai/ui exec tsc --noEmit --pretty 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/v2/InnerMenu.tsx
git commit -m "feat(v2): add InnerMenu project selector"
```

---

## Task 4: AgentAvatar, CeoNode, AgentNode Components

**Files:**
- Create: `ui/src/components/v2/AgentAvatar.tsx`
- Create: `ui/src/components/v2/CeoNode.tsx`
- Create: `ui/src/components/v2/AgentNode.tsx`

The building blocks of the network graph.

- [ ] **Step 1: Create AgentAvatar**

```typescript
// ui/src/components/v2/AgentAvatar.tsx
import { cn } from "@/lib/utils";
import type { V2Status } from "@/lib/v2-status";
import { v2StatusStyles, v2StatusIcon, v2StatusPulses } from "@/lib/v2-status";

interface AgentAvatarProps {
  name: string;
  icon?: string;
  status: V2Status;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function dicebearUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=161a27`;
}

export function AgentAvatar({ name, icon, status, size = "md", className }: AgentAvatarProps) {
  const s = v2StatusStyles[status];
  const dotIcon = v2StatusIcon(status);
  const pulses = v2StatusPulses(status);
  const sizeMap = { sm: 34, md: 56, lg: 46 };
  const px = sizeMap[size];

  return (
    <div
      className={cn("relative flex items-center justify-center rounded-full border-2", s.border, s.bg, s.glow, status === "idle" && "opacity-40", className)}
      style={{ width: px, height: px }}
    >
      <img
        src={dicebearUrl(name)}
        alt={name}
        className="h-full w-full rounded-full object-cover"
        loading="lazy"
      />
      {status !== "idle" && (
        <div
          className={cn(
            "absolute -right-px -top-px flex h-4 w-4 items-center justify-center rounded-full border-[2.5px] border-[#060810]",
            s.dot,
            pulses && "animate-pulse",
          )}
        >
          {dotIcon && (
            <span className="text-[7px] font-extrabold leading-none text-[#0b0d15]">{dotIcon}</span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create CeoNode**

```typescript
// ui/src/components/v2/CeoNode.tsx
import { cn } from "@/lib/utils";

interface CeoNodeProps {
  className?: string;
}

export function CeoNode({ className }: CeoNodeProps) {
  return (
    <div className={cn("absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2", className)}>
      {/* Breathing rings */}
      <div className="absolute -inset-6 animate-[ring-breathe_4s_ease-in-out_infinite_1.5s] rounded-full border border-dashed border-indigo-400/[0.06]" />
      <div className="absolute -inset-2.5 animate-[ring-breathe_4s_ease-in-out_infinite] rounded-full border-[1.5px] border-indigo-400/[0.15]" />
      {/* Node */}
      <div className="flex h-[82px] w-[82px] cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-[0_0_0_1px_rgba(129,140,248,0.15),0_0_50px_rgba(99,102,241,0.18),0_0_100px_rgba(99,102,241,0.06)] transition-transform hover:scale-105">
        <span className="text-[32px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]">👔</span>
      </div>
      <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30 font-['Outfit',sans-serif]">
        You
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Create AgentNode**

```typescript
// ui/src/components/v2/AgentNode.tsx
import { cn } from "@/lib/utils";
import { AgentAvatar } from "./AgentAvatar";
import type { V2Status } from "@/lib/v2-status";

export interface AgentNodeData {
  id: string;
  name: string;
  icon?: string;
  role?: string;
  currentTask?: string;
  status: V2Status;
}

interface AgentNodeProps {
  agent: AgentNodeData;
  style?: React.CSSProperties;
  onClick?: () => void;
  animationDelay?: string;
}

export function AgentNode({ agent, style, onClick, animationDelay }: AgentNodeProps) {
  return (
    <button
      onClick={onClick}
      className="absolute z-[4] flex flex-col items-center gap-[5px] transition-transform duration-150 hover:scale-110 animate-[float-in_0.5s_ease-out_backwards]"
      style={{ ...style, animationDelay }}
    >
      <AgentAvatar name={agent.name} icon={agent.icon} status={agent.status} size="md" />
      <span className="text-[12px] font-semibold text-white font-['Outfit',sans-serif]">{agent.name}</span>
      {agent.role && <span className="-mt-1 text-[9px] text-white/30">{agent.role}</span>}
      {agent.currentTask && (
        <span className="-mt-0.5 max-w-[120px] truncate rounded-md border border-white/[0.03] bg-[#1e2233] px-2.5 py-0.5 text-[9.5px] text-white/55 backdrop-blur-sm">
          {agent.currentTask}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Typecheck**

Run:
```bash
export PATH="$HOME/local-node/bin:$PATH"
cd /Users/valeriorullo/Downloads/GitHub/paperclip
pnpm --filter @paperclipai/ui exec tsc --noEmit --pretty 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/v2/AgentAvatar.tsx ui/src/components/v2/CeoNode.tsx ui/src/components/v2/AgentNode.tsx
git commit -m "feat(v2): add AgentAvatar, CeoNode, AgentNode graph components"
```

---

## Task 5: GraphLines + NetworkGraph

**Files:**
- Create: `ui/src/components/v2/GraphLines.tsx`
- Create: `ui/src/components/v2/NetworkGraph.tsx`

The radial graph assembler — positions agents around the CEO and draws SVG connections.

- [ ] **Step 1: Create GraphLines**

```typescript
// ui/src/components/v2/GraphLines.tsx
import type { AgentNodeData } from "./AgentNode";

interface GraphLinesProps {
  agents: Array<AgentNodeData & { x: number; y: number }>;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

const LINE_CLASSES: Record<string, string> = {
  live: "stroke-[#67e8f9] opacity-20 [stroke-dasharray:6_4] animate-[flowline_2s_linear_infinite]",
  alert: "stroke-[#fcd34d] opacity-25 [stroke-dasharray:4_4] animate-[flowline_3s_linear_infinite]",
  done: "stroke-[#6ee7b7] opacity-[0.12]",
  error: "stroke-[#fca5a5] opacity-20 [stroke-dasharray:3_3] animate-[flowline_1.5s_linear_infinite]",
  idle: "stroke-white/[0.04]",
};

export function GraphLines({ agents, centerX, centerY, width, height }: GraphLinesProps) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1]"
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      {/* Animated particle paths */}
      <defs>
        {agents.map((a) => (
          <path
            key={`path-${a.id}`}
            id={`path-${a.id}`}
            d={`M${centerX},${centerY} L${a.x},${a.y}`}
          />
        ))}
      </defs>

      {/* Connection lines */}
      {agents.map((a) => {
        const lineClass = LINE_CLASSES[
          a.status === "working" ? "live" :
          a.status === "needs-me" ? "alert" :
          a.status === "done" ? "done" :
          a.status === "error" ? "error" : "idle"
        ];
        return (
          <line
            key={`line-${a.id}`}
            x1={centerX} y1={centerY}
            x2={a.x} y2={a.y}
            className={`stroke-1 ${lineClass}`}
          />
        );
      })}

      {/* Travelling orbs on active/alert lines */}
      {agents
        .filter((a) => a.status === "working" || a.status === "needs-me")
        .map((a) => (
          <circle
            key={`orb-${a.id}`}
            r={2.5}
            className={a.status === "working"
              ? "fill-[#67e8f9] [filter:drop-shadow(0_0_4px_#67e8f9)]"
              : "fill-[#fcd34d] [filter:drop-shadow(0_0_4px_#fcd34d)]"
            }
          >
            <animateMotion
              dur={a.status === "working" ? "2.8s" : "2.5s"}
              repeatCount="indefinite"
            >
              <mpath href={`#path-${a.id}`} />
            </animateMotion>
          </circle>
        ))}
    </svg>
  );
}
```

- [ ] **Step 2: Create NetworkGraph**

```typescript
// ui/src/components/v2/NetworkGraph.tsx
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CeoNode } from "./CeoNode";
import { AgentNode } from "./AgentNode";
import type { AgentNodeData } from "./AgentNode";
import { GraphLines } from "./GraphLines";

interface NetworkGraphProps {
  agents: AgentNodeData[];
  onAgentClick?: (agentId: string) => void;
  className?: string;
}

const GRAPH_W = 680;
const GRAPH_H = 600;
const CENTER_X = GRAPH_W / 2;
const CENTER_Y = GRAPH_H / 2 - 10;
const ORBIT_RADIUS = 210;

/** Distribute agents evenly around the center, starting from top */
function layoutAgents(agents: AgentNodeData[]) {
  const n = agents.length;
  if (n === 0) return [];

  const startAngle = -Math.PI / 2; // top
  return agents.map((agent, i) => {
    const angle = startAngle + (2 * Math.PI * i) / n;
    const x = CENTER_X + Math.cos(angle) * ORBIT_RADIUS;
    const y = CENTER_Y + Math.sin(angle) * ORBIT_RADIUS;
    return { ...agent, x, y };
  });
}

export function NetworkGraph({ agents, onAgentClick, className }: NetworkGraphProps) {
  const positioned = useMemo(() => layoutAgents(agents), [agents]);

  return (
    <div className={cn("relative flex flex-1 items-center justify-center overflow-hidden", className)}>
      {/* Orbital rings */}
      <div className="absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-400/[0.04]" />
      <div className="absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-indigo-400/[0.035]" />
      <div className="absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-400/[0.06]" />

      <div className="relative" style={{ width: GRAPH_W, height: GRAPH_H }}>
        <GraphLines
          agents={positioned}
          centerX={CENTER_X}
          centerY={CENTER_Y}
          width={GRAPH_W}
          height={GRAPH_H}
        />

        <CeoNode />

        {positioned.map((agent, i) => (
          <AgentNode
            key={agent.id}
            agent={agent}
            style={{
              left: agent.x - 28,
              top: agent.y - 28,
            }}
            onClick={() => onAgentClick?.(agent.id)}
            animationDelay={`${i * 0.06}s`}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add CSS keyframes**

Add to `ui/src/index.css` at the end (before closing):

```css
@keyframes ring-breathe {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.06; transform: scale(1.1); }
}
@keyframes flowline {
  to { stroke-dashoffset: -10; }
}
@keyframes float-in {
  from { opacity: 0; transform: translateY(10px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
```

- [ ] **Step 4: Typecheck**

Run:
```bash
export PATH="$HOME/local-node/bin:$PATH"
cd /Users/valeriorullo/Downloads/GitHub/paperclip
pnpm --filter @paperclipai/ui exec tsc --noEmit --pretty 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/v2/GraphLines.tsx ui/src/components/v2/NetworkGraph.tsx ui/src/index.css
git commit -m "feat(v2): add NetworkGraph with radial layout, SVG lines, and particle orbs"
```

---

## Task 6: InteractionMask Shell + Chat + Details + Files Tabs

**Files:**
- Create: `ui/src/components/v2/OutputPreviewCard.tsx`
- Create: `ui/src/components/v2/FilePill.tsx`
- Create: `ui/src/components/v2/MaskChat.tsx`
- Create: `ui/src/components/v2/MaskDetails.tsx`
- Create: `ui/src/components/v2/MaskFiles.tsx`
- Create: `ui/src/components/v2/InteractionMask.tsx`

This is the largest task — the slide-in panel with 3 tabs. Breaking into sub-steps.

- [ ] **Step 1: Create OutputPreviewCard**

```typescript
// ui/src/components/v2/OutputPreviewCard.tsx
import { ExternalLink } from "lucide-react";

interface OutputPreviewCardProps {
  name: string;
  previewUrl?: string;
  openUrl?: string;
}

export function OutputPreviewCard({ name, previewUrl, openUrl }: OutputPreviewCardProps) {
  return (
    <div
      className="mt-2 cursor-pointer overflow-hidden rounded-lg border border-white/10 bg-[#1e2233] transition-colors hover:border-indigo-400/50"
      onClick={() => openUrl && window.open(openUrl, "_blank")}
    >
      <div className="flex h-[120px] items-center justify-center bg-gradient-to-br from-[#1a1040] to-[#0f2027]">
        {previewUrl ? (
          <iframe src={previewUrl} className="h-full w-full pointer-events-none" title={name} />
        ) : (
          <div className="flex w-[85%] h-[90%] flex-col items-center justify-center gap-1 rounded border border-white/[0.06] bg-[#111] text-[8px] text-white/30">
            <div className="h-1 w-[60%] rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300" />
            <div className="h-0.5 w-[40%] rounded-full bg-white/10" />
            <div className="h-0.5 w-[25%] rounded-full bg-white/10" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-medium text-white/55">{name}</span>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-[10px] font-medium text-indigo-400 hover:underline"
          >
            Apri nel browser <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create FilePill**

```typescript
// ui/src/components/v2/FilePill.tsx
interface FilePillProps {
  icon?: string;
  name: string;
  size?: string;
  href?: string;
}

export function FilePill({ icon = "📄", name, size, href }: FilePillProps) {
  return (
    <a
      href={href ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-[#1e2233] px-2.5 py-1.5 text-[11px] transition-colors hover:border-white/[0.12]"
    >
      <span>{icon}</span>
      <span className="font-medium text-white/55">{name}</span>
      {size && <span className="text-[9px] text-white/[0.15]">{size}</span>}
    </a>
  );
}
```

- [ ] **Step 3: Create MaskChat**

```typescript
// ui/src/components/v2/MaskChat.tsx
import { cn } from "@/lib/utils";
import { OutputPreviewCard } from "./OutputPreviewCard";
import { FilePill } from "./FilePill";

export interface ChatMessage {
  id: string;
  from: "agent" | "ceo";
  html: string;
  timestamp: string;
  outputPreview?: { name: string; openUrl?: string };
  files?: Array<{ icon?: string; name: string; size?: string; href?: string }>;
}

interface MaskChatProps {
  messages: ChatMessage[];
}

export function MaskChat({ messages }: MaskChatProps) {
  return (
    <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            "max-w-[84%] px-3.5 py-2.5 text-[13px] leading-[1.55]",
            msg.from === "agent"
              ? "self-start rounded-xl rounded-bl-sm border border-white/[0.06] bg-[#161a27]"
              : "self-end rounded-xl rounded-br-sm bg-indigo-600 text-white",
          )}
        >
          <div dangerouslySetInnerHTML={{ __html: msg.html }} />
          {msg.outputPreview && (
            <OutputPreviewCard name={msg.outputPreview.name} openUrl={msg.outputPreview.openUrl} />
          )}
          {msg.files?.map((f, i) => <FilePill key={i} {...f} />)}
          <div className={cn("mt-1 text-[10px]", msg.from === "agent" ? "text-white/30" : "text-white/45")}>
            {msg.timestamp}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create MaskDetails**

```typescript
// ui/src/components/v2/MaskDetails.tsx

interface SubTask {
  label: string;
  status: "done" | "active" | "pending";
}

interface MaskDetailsProps {
  unlockExplanation?: string;
  subTasks?: SubTask[];
  metrics?: Array<{ label: string; value: string }>;
}

export function MaskDetails({ unlockExplanation, subTasks, metrics }: MaskDetailsProps) {
  const dotClass = { done: "bg-[#6ee7b7]", active: "bg-[#67e8f9] animate-pulse", pending: "bg-white/30" };

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {unlockExplanation && (
        <div className="mb-4">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30 font-['Outfit',sans-serif]">
            Cosa sblocca la tua approvazione
          </h4>
          <div className="rounded-lg border-l-2 border-indigo-400 bg-[#161a27] px-3.5 py-2.5 text-[13px] leading-[1.6] text-white/55">
            {unlockExplanation}
          </div>
        </div>
      )}

      {subTasks && subTasks.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30 font-['Outfit',sans-serif]">
            Sotto-attivita
          </h4>
          <ul className="space-y-0">
            {subTasks.map((st, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5 text-[12px] text-white/55">
                <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${dotClass[st.status]}`} />
                {st.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {metrics && metrics.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30 font-['Outfit',sans-serif]">
            Metriche
          </h4>
          {metrics.map((m, i) => (
            <div key={i} className="flex justify-between border-b border-white/[0.03] py-[7px] text-[12.5px] last:border-none">
              <span className="text-white/30">{m.label}</span>
              <span className="font-medium text-white/55 font-['JetBrains_Mono',monospace] text-[11.5px]">{m.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create MaskFiles**

```typescript
// ui/src/components/v2/MaskFiles.tsx
import { ExternalLink, Download } from "lucide-react";

export interface MaskFile {
  icon: string;
  name: string;
  meta: string;
  time: string;
  action: "open" | "download";
  href?: string;
}

interface MaskFilesProps {
  files: MaskFile[];
}

export function MaskFiles({ files }: MaskFilesProps) {
  return (
    <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-5 py-4">
      {files.map((f, i) => (
        <a
          key={i}
          href={f.href ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 rounded-lg border border-white/[0.03] bg-[#161a27] px-3 py-2.5 transition-all hover:border-white/10 hover:bg-[#1e2233]"
        >
          <span className="shrink-0 text-xl">{f.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-medium">{f.name}</div>
            <div className="mt-0.5 flex gap-2 text-[10px] text-white/30">
              <span>{f.meta}</span>
              <span>{f.time}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-indigo-400/[0.12] px-2.5 py-1 text-[10px] font-medium text-indigo-400 transition-all hover:bg-indigo-400/[0.12]">
            {f.action === "open" ? (
              <>Apri <ExternalLink className="h-2.5 w-2.5" /></>
            ) : (
              <>Scarica <Download className="h-2.5 w-2.5" /></>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Create InteractionMask shell**

```typescript
// ui/src/components/v2/InteractionMask.tsx
import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "./AgentAvatar";
import { MaskChat, type ChatMessage } from "./MaskChat";
import { MaskDetails } from "./MaskDetails";
import { MaskFiles, type MaskFile } from "./MaskFiles";
import type { V2Status } from "@/lib/v2-status";

type MaskTab = "chat" | "details" | "files";

export interface MaskData {
  agentId: string;
  agentName: string;
  agentRole?: string;
  agentStatus: V2Status;
  projectName?: string;
  modelTag?: string;
  costTag?: string;
  requestMessage?: string;
  messages: ChatMessage[];
  unlockExplanation?: string;
  subTasks?: Array<{ label: string; status: "done" | "active" | "pending" }>;
  metrics?: Array<{ label: string; value: string }>;
  files: MaskFile[];
}

interface InteractionMaskProps {
  open: boolean;
  data: MaskData | null;
  onClose: () => void;
  onApprove?: () => void;
  onRevise?: () => void;
  onReject?: () => void;
  onSendMessage?: (text: string) => void;
}

export function InteractionMask({
  open, data, onClose, onApprove, onRevise, onReject, onSendMessage,
}: InteractionMaskProps) {
  const [tab, setTab] = useState<MaskTab>("chat");
  const [input, setInput] = useState("");

  if (!data) return null;

  const showActions = data.agentStatus === "needs-me";

  return (
    <div
      className={cn(
        "absolute inset-y-0 right-0 z-30 flex w-[460px] flex-col border-l border-white/[0.06] bg-[#10131d] shadow-[-12px_0_48px_rgba(0,0,0,0.5)] transition-transform duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.03] px-5 py-4">
        <AgentAvatar name={data.agentName} status={data.agentStatus} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold font-['Outfit',sans-serif]">
            {data.agentName}{data.agentRole ? ` — ${data.agentRole}` : ""}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-white/30">
            {data.projectName && <span>{data.projectName}</span>}
            {data.costTag && (
              <span className="rounded border border-white/[0.03] bg-[#161a27] px-2 py-px font-['JetBrains_Mono',monospace] text-[10px]">
                {data.costTag}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-white/30 transition-all hover:bg-white/[0.06] hover:text-white">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Request banner */}
      {data.requestMessage && (
        <div className="flex items-center gap-2.5 border-b border-[rgba(252,211,77,0.08)] bg-[rgba(252,211,77,0.08)] px-5 py-2.5 text-[13px] font-medium text-[#fcd34d]">
          <span className="shrink-0">✋</span>
          {data.requestMessage}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-white/[0.03] px-5">
        {(["chat", "details", "files"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 border-transparent px-0 py-2.5 mr-5 text-[12px] font-medium text-white/30 transition-all",
              "hover:text-white/55",
              tab === t && "border-b-indigo-400 text-white",
            )}
          >
            {t === "chat" ? "Chat" : t === "details" ? "Dettagli" : "File"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "chat" && <MaskChat messages={data.messages} />}
      {tab === "details" && (
        <MaskDetails
          unlockExplanation={data.unlockExplanation}
          subTasks={data.subTasks}
          metrics={data.metrics}
        />
      )}
      {tab === "files" && <MaskFiles files={data.files} />}

      {/* Actions */}
      {showActions && (
        <div className="flex gap-2 border-t border-white/[0.06] px-5 py-3.5">
          <button onClick={onApprove} className="flex-1 rounded-lg bg-[#6ee7b7] py-2.5 text-center text-[13px] font-semibold text-[#0b0d15] font-['Outfit',sans-serif] transition-all hover:brightness-110">Approva</button>
          <button onClick={onRevise} className="flex-1 rounded-lg border border-[rgba(252,211,77,0.15)] bg-[rgba(252,211,77,0.08)] py-2.5 text-center text-[13px] font-semibold text-[#fcd34d] font-['Outfit',sans-serif] transition-all hover:bg-[rgba(252,211,77,0.14)]">Revisione</button>
          <button onClick={onReject} className="flex-1 rounded-lg border border-[rgba(252,165,165,0.15)] bg-[rgba(252,165,165,0.08)] py-2.5 text-center text-[13px] font-semibold text-[#fca5a5] font-['Outfit',sans-serif] transition-all hover:bg-[rgba(252,165,165,0.14)]">Rifiuta</button>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 border-t border-white/[0.03] px-5 py-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              onSendMessage?.(input.trim());
              setInput("");
            }
          }}
          placeholder={`Scrivi a ${data.agentName}...`}
          className="flex-1 rounded-lg border border-white/[0.06] bg-[#161a27] px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-indigo-400"
        />
        <button
          onClick={() => { if (input.trim()) { onSendMessage?.(input.trim()); setInput(""); } }}
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white font-['Outfit',sans-serif] transition-all hover:brightness-[1.15]"
        >
          Invia
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Typecheck all mask components**

Run:
```bash
export PATH="$HOME/local-node/bin:$PATH"
cd /Users/valeriorullo/Downloads/GitHub/paperclip
pnpm --filter @paperclipai/ui exec tsc --noEmit --pretty 2>&1 | tail -10
```

- [ ] **Step 8: Commit**

```bash
git add ui/src/components/v2/OutputPreviewCard.tsx ui/src/components/v2/FilePill.tsx ui/src/components/v2/MaskChat.tsx ui/src/components/v2/MaskDetails.tsx ui/src/components/v2/MaskFiles.tsx ui/src/components/v2/InteractionMask.tsx
git commit -m "feat(v2): add InteractionMask with Chat, Details, Files tabs"
```

---

## Task 7: TopBar, InboxItem, InboxSection Components

**Files:**
- Create: `ui/src/components/v2/TopBar.tsx`
- Create: `ui/src/components/v2/InboxItem.tsx`
- Create: `ui/src/components/v2/InboxSection.tsx`

- [ ] **Step 1: Create TopBar**

```typescript
// ui/src/components/v2/TopBar.tsx
import { cn } from "@/lib/utils";

interface KPI {
  value: string;
  label: string;
  hot?: boolean;
}

interface TopBarProps {
  title: string;
  chip?: string;
  kpis?: KPI[];
  modelTag?: string;
  className?: string;
}

export function TopBar({ title, chip, kpis, modelTag, className }: TopBarProps) {
  return (
    <div className={cn("flex shrink-0 items-center justify-between border-b border-white/[0.03] bg-[#0b0d15] px-7 py-2.5", className)}>
      <div className="flex items-center gap-2.5">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] font-['Outfit',sans-serif]">{title}</h2>
        {chip && <span className="rounded-md bg-indigo-400/[0.12] px-2.5 py-0.5 text-[10.5px] font-medium text-indigo-400">{chip}</span>}
      </div>
      {(kpis || modelTag) && (
        <div className="flex items-center gap-5">
          {kpis?.map((k, i) => (
            <div key={i} className="flex items-center gap-[5px] text-[11.5px] text-white/30">
              <span className={cn("font-medium font-['JetBrains_Mono',monospace] text-[12px]", k.hot ? "text-[#fcd34d]" : "text-white/55")}>{k.value}</span>
              {k.label}
              {i < (kpis?.length ?? 0) - 1 && <div className="ml-4 h-3.5 w-px bg-white/[0.06]" />}
            </div>
          ))}
          {modelTag && (
            <>
              <div className="h-3.5 w-px bg-white/[0.06]" />
              <span className="rounded border border-white/[0.03] bg-[#161a27] px-2 py-0.5 font-['JetBrains_Mono',monospace] text-[10px] text-white/30">{modelTag}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create InboxItem**

```typescript
// ui/src/components/v2/InboxItem.tsx
import { cn } from "@/lib/utils";
import { AgentAvatar } from "./AgentAvatar";
import type { V2Status } from "@/lib/v2-status";

interface InboxItemProps {
  agentName: string;
  agentStatus: V2Status;
  title: string;
  subtitle: string;
  time: string;
  action?: { label: string; variant: "go" | "look" };
  onClick?: () => void;
}

export function InboxItem({ agentName, agentStatus, title, subtitle, time, action, onClick }: InboxItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-white/[0.03] bg-[#161a27] px-3.5 py-3 text-left transition-all hover:border-white/10 hover:bg-[#1e2233]"
    >
      <AgentAvatar name={agentName} status={agentStatus} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="mt-0.5 truncate text-[11px] text-white/30">{subtitle}</div>
      </div>
      <span className="shrink-0 font-['JetBrains_Mono',monospace] text-[10px] text-white/30">{time}</span>
      {action && (
        <span className={cn(
          "shrink-0 rounded-md px-3 py-1 text-[10.5px] font-semibold font-['Outfit',sans-serif]",
          action.variant === "go" ? "bg-[rgba(110,231,183,0.1)] text-[#6ee7b7]" : "bg-[rgba(252,211,77,0.08)] text-[#fcd34d]",
        )}>
          {action.label}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 3: Create InboxSection**

```typescript
// ui/src/components/v2/InboxSection.tsx
import { cn } from "@/lib/utils";

interface InboxSectionProps {
  title: string;
  count?: number;
  color: string;
  muted?: boolean;
  children: React.ReactNode;
}

export function InboxSection({ title, count, color, muted, children }: InboxSectionProps) {
  return (
    <div className={cn("px-7", muted && "opacity-40")}>
      <div className="flex items-center gap-2 pb-2 pt-[18px]">
        <div className="h-[5px] w-[5px] rounded-full" style={{ background: color }} />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] font-['Outfit',sans-serif]" style={{ color }}>
          {title}
        </h3>
        {count != null && (
          <span className="font-['JetBrains_Mono',monospace] text-[10.5px] text-white/30">{count}</span>
        )}
      </div>
      <div className="space-y-[5px]">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run:
```bash
export PATH="$HOME/local-node/bin:$PATH"
cd /Users/valeriorullo/Downloads/GitHub/paperclip
pnpm --filter @paperclipai/ui exec tsc --noEmit --pretty 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/v2/TopBar.tsx ui/src/components/v2/InboxItem.tsx ui/src/components/v2/InboxSection.tsx
git commit -m "feat(v2): add TopBar, InboxItem, InboxSection components"
```

---

## Task 8: V2Dashboard Page

**Files:**
- Create: `ui/src/pages/v2/V2Dashboard.tsx`

Assembles TopBar + NetworkGraph + InteractionMask. Fetches real data from existing APIs.

- [ ] **Step 1: Create V2Dashboard page**

```typescript
// ui/src/pages/v2/V2Dashboard.tsx
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { agentsApi } from "@/api/agents";
import { issuesApi } from "@/api/issues";
import { heartbeatsApi } from "@/api/heartbeats";
import { dashboardApi } from "@/api/dashboard";
import { queryKeys } from "@/lib/queryKeys";
import { formatCents } from "@/lib/utils";
import { agentToV2Status } from "@/lib/v2-status";
import { TopBar } from "@/components/v2/TopBar";
import { NetworkGraph } from "@/components/v2/NetworkGraph";
import { InteractionMask } from "@/components/v2/InteractionMask";
import type { MaskData } from "@/components/v2/InteractionMask";
import type { AgentNodeData } from "@/components/v2/AgentNode";
import { PageSkeleton } from "@/components/PageSkeleton";

interface V2DashboardProps {
  projectId?: string | null;
}

export function V2Dashboard({ projectId }: V2DashboardProps) {
  const { selectedCompanyId } = useCompany();
  const [maskAgentId, setMaskAgentId] = useState<string | null>(null);

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!, projectId ? { projectId } : undefined),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const { data: dashSummary } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Build agent node data
  const agentNodes: AgentNodeData[] = useMemo(() => {
    if (!agents) return [];

    const liveAgentIds = new Set((liveRuns ?? []).map((r) => r.agentId));
    const blockedByAgent = new Map<string, boolean>();
    const taskByAgent = new Map<string, string>();

    for (const issue of issues ?? []) {
      if (!issue.assigneeAgentId) continue;
      if (issue.status === "blocked" || issue.status === "in_review") {
        blockedByAgent.set(issue.assigneeAgentId, true);
      }
      if (issue.status === "in_progress" || issue.status === "blocked" || issue.status === "in_review") {
        if (!taskByAgent.has(issue.assigneeAgentId)) {
          taskByAgent.set(issue.assigneeAgentId, issue.title);
        }
      }
    }

    return agents
      .filter((a) => a.status !== "archived")
      .map((a) => ({
        id: a.id,
        name: a.name,
        icon: a.icon,
        role: a.title ?? a.role ?? undefined,
        currentTask: taskByAgent.get(a.id),
        status: agentToV2Status(a.status, {
          hasBlockedIssues: blockedByAgent.get(a.id),
          hasLiveRun: liveAgentIds.has(a.id),
        }),
      }));
  }, [agents, issues, liveRuns]);

  // KPIs
  const needsDecision = (issues ?? []).filter(
    (i) => i.status === "blocked" || i.status === "in_review",
  ).length;
  const activeTasks = (issues ?? []).filter(
    (i) => i.status === "in_progress" || i.status === "todo",
  ).length;
  const todayCost = dashSummary?.spendTodayCents ?? 0;

  // Build mask data for selected agent
  const maskData: MaskData | null = useMemo(() => {
    if (!maskAgentId || !agents) return null;
    const agent = agents.find((a) => a.id === maskAgentId);
    if (!agent) return null;

    const agentIssues = (issues ?? []).filter((i) => i.assigneeAgentId === maskAgentId);
    const blockedIssue = agentIssues.find((i) => i.status === "blocked" || i.status === "in_review");
    const liveAgentIds = new Set((liveRuns ?? []).map((r) => r.agentId));

    const status = agentToV2Status(agent.status, {
      hasBlockedIssues: !!blockedIssue,
      hasLiveRun: liveAgentIds.has(agent.id),
    });

    return {
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.title ?? agent.role ?? undefined,
      agentStatus: status,
      projectName: blockedIssue?.projectId ? "Project" : undefined,
      costTag: agent.adapterType ?? undefined,
      requestMessage: blockedIssue
        ? `${agent.name} ha bisogno della tua approvazione su "${blockedIssue.title}"`
        : undefined,
      messages: [], // Will be populated from real comments API
      files: [],    // Will be populated from real documents API
    };
  }, [maskAgentId, agents, issues, liveRuns]);

  const handleAgentClick = useCallback((agentId: string) => {
    setMaskAgentId(agentId);
  }, []);

  if (agentsLoading) return <PageSkeleton />;

  return (
    <>
      <TopBar
        title={projectId ? "Progetto" : "Dashboard"}
        chip={`${agentNodes.length} agenti`}
        kpis={[
          { value: String(needsDecision), label: "da decidere", hot: needsDecision > 0 },
          { value: String(activeTasks), label: "task" },
          { value: formatCents(todayCost), label: "oggi" },
        ]}
      />
      <NetworkGraph
        agents={agentNodes}
        onAgentClick={handleAgentClick}
      />
      <InteractionMask
        open={maskAgentId !== null}
        data={maskData}
        onClose={() => setMaskAgentId(null)}
      />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
export PATH="$HOME/local-node/bin:$PATH"
cd /Users/valeriorullo/Downloads/GitHub/paperclip
pnpm --filter @paperclipai/ui exec tsc --noEmit --pretty 2>&1 | tail -10
```

Fix any type mismatches against real API types (Issue, Agent may have slightly different field names — check `@paperclipai/shared` types).

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/v2/V2Dashboard.tsx
git commit -m "feat(v2): add V2Dashboard page with real data wiring"
```

---

## Task 9: V2Inbox Page

**Files:**
- Create: `ui/src/pages/v2/V2Inbox.tsx`

3-section scroll page using real inbox data.

- [ ] **Step 1: Create V2Inbox page**

```typescript
// ui/src/pages/v2/V2Inbox.tsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { issuesApi } from "@/api/issues";
import { agentsApi } from "@/api/agents";
import { heartbeatsApi } from "@/api/heartbeats";
import { queryKeys } from "@/lib/queryKeys";
import { issueToV2Status } from "@/lib/v2-status";
import { relativeTime } from "@/lib/utils";
import { TopBar } from "@/components/v2/TopBar";
import { InboxSection } from "@/components/v2/InboxSection";
import { InboxItem } from "@/components/v2/InboxItem";
import { PageSkeleton } from "@/components/PageSkeleton";

export function V2Inbox() {
  const { selectedCompanyId } = useCompany();

  const { data: issues, isLoading } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!, { touchedByUserId: "me" }),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, { name: string }>();
    for (const a of agents ?? []) m.set(a.id, { name: a.name });
    return m;
  }, [agents]);

  const liveIssueIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of liveRuns ?? []) if (r.issueId) s.add(r.issueId);
    return s;
  }, [liveRuns]);

  // Categorize issues into 3 sections
  const { urgent, inProgress, done } = useMemo(() => {
    const urg: typeof issues = [];
    const prog: typeof issues = [];
    const dn: typeof issues = [];

    for (const issue of issues ?? []) {
      const status = issueToV2Status(issue.status, {
        isUnread: issue.isUnreadForMe,
        hasLiveRun: liveIssueIds.has(issue.id),
      });
      if (status === "needs-me") urg.push(issue);
      else if (status === "working") prog.push(issue);
      else dn.push(issue);
    }

    return { urgent: urg, inProgress: prog, done: dn };
  }, [issues, liveIssueIds]);

  if (isLoading) return <PageSkeleton />;

  const agentName = (agentId?: string | null) =>
    agentId ? agentMap.get(agentId)?.name ?? "Agente" : "Agente";

  return (
    <>
      <TopBar title="Inbox" />
      <div className="flex-1 overflow-y-auto">
        <InboxSection title="Urgente" count={urgent.length} color="#fcd34d">
          {urgent.map((issue) => (
            <InboxItem
              key={issue.id}
              agentName={agentName(issue.assigneeAgentId)}
              agentStatus="needs-me"
              title={`${agentName(issue.assigneeAgentId)} ha bisogno della tua approvazione`}
              subtitle={issue.title}
              time={relativeTime(issue.updatedAt)}
              action={{ label: "Apri", variant: "go" }}
            />
          ))}
        </InboxSection>

        <InboxSection title="In corso" count={inProgress.length} color="#67e8f9">
          {inProgress.map((issue) => (
            <InboxItem
              key={issue.id}
              agentName={agentName(issue.assigneeAgentId)}
              agentStatus="working"
              title={`${agentName(issue.assigneeAgentId)} sta lavorando`}
              subtitle={issue.title}
              time={relativeTime(issue.updatedAt)}
            />
          ))}
        </InboxSection>

        <InboxSection title="Archivio" count={done.length} color="rgba(255,255,255,0.3)" muted>
          {/* Collapsed by default — expand on click */}
        </InboxSection>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck and fix**

Run:
```bash
export PATH="$HOME/local-node/bin:$PATH"
cd /Users/valeriorullo/Downloads/GitHub/paperclip
pnpm --filter @paperclipai/ui exec tsc --noEmit --pretty 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/v2/V2Inbox.tsx
git commit -m "feat(v2): add V2Inbox page with 3-section layout"
```

---

## Task 10: V2Layout + Route Registration

**Files:**
- Create: `ui/src/pages/v2/V2Layout.tsx`
- Modify: `ui/src/App.tsx` — add v2 route group

- [ ] **Step 1: Create V2Layout**

```typescript
// ui/src/pages/v2/V2Layout.tsx
import { useState } from "react";
import { Outlet } from "@/lib/router";
import { V2Sidebar } from "@/components/v2/V2Sidebar";
import { InnerMenu } from "@/components/v2/InnerMenu";

export function V2Layout() {
  const [innerCollapsed, setInnerCollapsed] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#060810] text-[#e4e7ef]">
      <V2Sidebar />
      <InnerMenu
        collapsed={innerCollapsed}
        onToggle={() => setInnerCollapsed(!innerCollapsed)}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
      />
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <Outlet context={{ selectedProjectId }} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add v2 routes to App.tsx**

Find the company-prefixed routes block in `App.tsx` (around line 150-200) and add before the closing `</Routes>`:

```typescript
// Import at top of App.tsx
import { V2Layout } from "./pages/v2/V2Layout";
import { V2Dashboard } from "./pages/v2/V2Dashboard";
import { V2Inbox } from "./pages/v2/V2Inbox";

// Inside Routes, add v2 route group:
<Route path="/:companyPrefix/v2" element={<V2Layout />}>
  <Route path="dashboard" element={<V2Dashboard />} />
  <Route path="inbox" element={<V2Inbox />} />
  <Route index element={<Navigate to="dashboard" replace />} />
</Route>
```

- [ ] **Step 3: Typecheck**

Run:
```bash
export PATH="$HOME/local-node/bin:$PATH"
cd /Users/valeriorullo/Downloads/GitHub/paperclip
pnpm --filter @paperclipai/ui exec tsc --noEmit --pretty 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/v2/V2Layout.tsx ui/src/App.tsx
git commit -m "feat(v2): add V2Layout and register /v2 routes"
```

---

## Task 11: Build Verification

**Files:** None — verification only.

- [ ] **Step 1: Run full build**

```bash
export PATH="$HOME/local-node/bin:$PATH"
cd /Users/valeriorullo/Downloads/GitHub/paperclip
pnpm --filter @paperclipai/ui build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify v2 route is accessible**

After server restart (founder must do this), navigate to:
`http://localhost:5173/{companyPrefix}/v2/dashboard`

Verify: V2 layout renders with sidebar, inner menu, and graph area.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(v2): CEO Console v2 — complete initial implementation"
```

---

## Broken Processes — Handoff for Fixing

These were identified during the audit and should be fixed in the existing codebase:

1. **StatusBadge collision** — `ui/src/components/StatusBadge.tsx` needs domain parameter to visually differentiate issue vs approval statuses
2. **False-done heuristic invisible** — `ui/src/lib/inbox.ts:315` — add visual indicator when `isFalseDoneLike` promotes an issue
3. **Description shown twice** — `ui/src/pages/IssueDetail.tsx:1508-1575` — remove either `extractObjectiveLine` subtitle or the TL;DR card
4. **Tabs inside tabs** — `ui/src/pages/IssueDetail.tsx:356-364` — flatten IssueActivityTab into parent
5. **GoalDetail auto-panel** — `ui/src/pages/GoalDetail.tsx` — remove `useEffect` that auto-opens panel on mount
6. **Dashboard 200-run poll** — `ui/src/pages/Dashboard.tsx` — reduce to polling only failed runs, or use a dedicated endpoint
7. **Triple-counted inbox** — `ui/src/pages/Inbox.tsx:1053,1117,1165` — remove red banner and per-row category badge when grouped by urgency
