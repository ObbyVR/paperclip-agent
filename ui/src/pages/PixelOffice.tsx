/**
 * PixelOffice — full-screen isometric pixel art office view.
 * Shows agents as pixel characters at desks, with speech bubbles
 * for pending requests, and workflow boards on the wall.
 *
 * Style: Habbo Hotel inspired, CSS-only (no external sprite assets).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { approvalsApi } from "../api/approvals";
import { activityApi } from "../api/activity";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";
import { AgentChatSheet } from "../components/AgentChatSheet";
import type { Agent, Approval, ActivityEvent } from "@paperclipai/shared";

/* ═══════════════════════════════════════════════════════════════
   Isometric helpers
   ═══════════════════════════════════════════════════════════════ */

const TILE = 48; // base tile size in px
const ISO_ANGLE = 26.565; // atan(0.5) degrees — standard iso

/** Convert grid (col, row) to pixel position for isometric projection */
function isoToScreen(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * (TILE / 2),
    y: (col + row) * (TILE / 4),
  };
}

/* ═══════════════════════════════════════════════════════════════
   Agent status → visual mapping
   ═══════════════════════════════════════════════════════════════ */

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  running: "#06b6d4",
  idle: "#6b7280",
  paused: "#f59e0b",
  error: "#ef4444",
  terminated: "#374151",
};

const DESK_GLOW: Record<string, string> = {
  active: "shadow-[0_0_12px_rgba(34,197,94,0.3)]",
  running: "shadow-[0_0_12px_rgba(6,182,212,0.4)]",
  idle: "",
  paused: "shadow-[0_0_8px_rgba(245,158,11,0.2)]",
  error: "shadow-[0_0_12px_rgba(239,68,68,0.3)]",
};

/* ═══════════════════════════════════════════════════════════════
   Pixel character component (CSS-only, no sprites)
   ═══════════════════════════════════════════════════════════════ */

function PixelCharacter({
  agent,
  position,
  hasBubble,
  bubbleText,
  bubbleUrgent,
  onClick,
  isSelected,
}: {
  agent: Agent;
  position: { x: number; y: number };
  hasBubble?: boolean;
  bubbleText?: string;
  bubbleUrgent?: boolean;
  onClick: () => void;
  isSelected?: boolean;
}) {
  const color = STATUS_COLORS[agent.status] ?? STATUS_COLORS.idle;
  const skinTone = "#e8b89d";
  const hairColors = ["#3d2b1f", "#1a1a2e", "#8b4513", "#c5a880", "#2d1b0e", "#4a2c2a"];
  const hairColor = hairColors[Math.abs(hashStr(agent.id)) % hairColors.length];
  const shirtColors = ["#4a6fa5", "#6b5b95", "#88b04b", "#ff6f61", "#45b8ac", "#92a8d1", "#f7cac9", "#b5838d"];
  const shirtColor = shirtColors[Math.abs(hashStr(agent.name)) % shirtColors.length];

  return (
    <div
      className={cn(
        "absolute flex flex-col items-center cursor-pointer transition-all duration-500 z-10",
        isSelected && "z-20 scale-110",
      )}
      style={{ left: position.x, top: position.y, transform: "translate(-50%, -100%)" }}
      onClick={onClick}
    >
      {/* Speech bubble */}
      {hasBubble && bubbleText && (
        <div
          className={cn(
            "absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full",
            "rounded-lg px-3 py-2 text-[10px] leading-tight max-w-[160px] min-w-[100px]",
            "border shadow-lg animate-bounce-subtle",
            bubbleUrgent
              ? "bg-red-950 border-red-500/60 text-red-200"
              : "bg-violet-950 border-violet-500/50 text-violet-200",
          )}
        >
          <div className="line-clamp-2">{bubbleText}</div>
          {/* Triangle pointer */}
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 -bottom-[6px] w-0 h-0",
              "border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent",
              bubbleUrgent
                ? "border-t-[6px] border-t-red-500/60"
                : "border-t-[6px] border-t-violet-500/50",
            )}
          />
        </div>
      )}

      {/* Character body — pixel art style using CSS boxes */}
      <div className="relative" style={{ width: 24, height: 36, imageRendering: "pixelated" }}>
        {/* Shadow */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full opacity-30"
          style={{ width: 20, height: 6, background: "#000" }}
        />
        {/* Legs */}
        <div className="absolute bottom-[2px] left-[6px]" style={{ width: 4, height: 8, background: "#2a2a3a" }} />
        <div className="absolute bottom-[2px] left-[14px]" style={{ width: 4, height: 8, background: "#2a2a3a" }} />
        {/* Body / shirt */}
        <div
          className="absolute bottom-[10px] left-[4px] rounded-t-sm"
          style={{ width: 16, height: 12, background: shirtColor }}
        />
        {/* Arms */}
        <div
          className="absolute bottom-[14px] left-[0px] rounded-sm"
          style={{ width: 4, height: 8, background: shirtColor }}
        />
        <div
          className="absolute bottom-[14px] right-[0px] rounded-sm"
          style={{ width: 4, height: 8, background: shirtColor }}
        />
        {/* Head */}
        <div
          className="absolute bottom-[22px] left-[5px] rounded-t-md"
          style={{ width: 14, height: 14, background: skinTone }}
        />
        {/* Hair */}
        <div
          className="absolute bottom-[30px] left-[4px] rounded-t-md"
          style={{ width: 16, height: 6, background: hairColor }}
        />
        {/* Eyes */}
        <div
          className="absolute bottom-[26px] left-[8px]"
          style={{ width: 2, height: 2, background: "#1a1a2e" }}
        />
        <div
          className="absolute bottom-[26px] left-[14px]"
          style={{ width: 2, height: 2, background: "#1a1a2e" }}
        />
        {/* Status dot */}
        <div
          className="absolute -bottom-1 -right-1 rounded-full border-2 border-[#0a0a10]"
          style={{ width: 8, height: 8, background: color }}
        />
      </div>

      {/* Name label */}
      <div
        className="mt-1 px-1.5 py-0.5 rounded text-center whitespace-nowrap"
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 5,
          color: "#888",
          background: "#0a0a1080",
          letterSpacing: "0.5px",
        }}
      >
        {agent.name.split("—")[0]?.trim().split(" ")[0]?.toUpperCase()}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Desk component (isometric CSS)
   ═══════════════════════════════════════════════════════════════ */

function IsometricDesk({
  position,
  status,
  hasMonitor,
}: {
  position: { x: number; y: number };
  status: string;
  hasMonitor?: boolean;
}) {
  const glow = DESK_GLOW[status] ?? "";
  return (
    <div
      className={cn("absolute", glow)}
      style={{ left: position.x, top: position.y, transform: "translate(-50%, -50%)" }}
    >
      {/* Desk surface */}
      <div
        className="border border-amber-900/40"
        style={{
          width: 44,
          height: 22,
          background: "linear-gradient(135deg, #5c3d1e, #7a5230)",
          borderRadius: 2,
          transform: "rotateX(45deg) rotateZ(-45deg) scale(0.9)",
        }}
      />
      {/* Monitor */}
      {hasMonitor && (
        <div
          className="absolute -top-[14px] left-1/2 -translate-x-1/2"
          style={{
            width: 16,
            height: 12,
            background: status === "active" || status === "running" ? "#1a3a5c" : "#1a1a26",
            border: "2px solid #333",
            borderRadius: 1,
          }}
        >
          {(status === "active" || status === "running") && (
            <div className="w-2 h-1 mx-auto mt-1 rounded-sm bg-cyan-400/60 animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Floor tile
   ═══════════════════════════════════════════════════════════════ */

function FloorTile({ col, row, variant }: { col: number; row: number; variant?: "carpet" | "wood" }) {
  const { x, y } = isoToScreen(col, row);
  const baseColor = variant === "carpet" ? "#1e1b30" : (col + row) % 2 === 0 ? "#16161e" : "#1a1a24";
  const borderColor = variant === "carpet" ? "#2a2640" : "#1e1e28";
  return (
    <div
      className="absolute"
      style={{
        left: x,
        top: y,
        width: TILE,
        height: TILE / 2,
        background: baseColor,
        borderRight: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        transform: "rotateX(60deg) rotateZ(-45deg)",
        transformOrigin: "center",
      }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════
   Wall decoration (workflow board)
   ═══════════════════════════════════════════════════════════════ */

function WorkflowBoard({
  title,
  steps,
  worker,
  position,
}: {
  title: string;
  steps: { status: "done" | "active" | "todo" | "blocked" }[];
  worker?: string;
  position: { x: number; y: number };
}) {
  const doneCount = steps.filter((s) => s.status === "done").length;
  const pct = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;
  return (
    <div
      className="absolute rounded border border-border/50 bg-[#12121a] px-2 py-1.5"
      style={{ left: position.x, top: position.y, minWidth: 90 }}
    >
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: "#666" }}>
        {title.toUpperCase()}
      </div>
      <div className="flex gap-[3px] mt-1.5">
        {steps.map((step, i) => (
          <div
            key={i}
            className={cn(
              "w-[8px] h-[8px] rounded-[1px] border",
              step.status === "done" && "bg-green-500/40 border-green-500/60",
              step.status === "active" && "bg-amber-500/40 border-amber-500/60 animate-pulse",
              step.status === "todo" && "bg-[#1a1a26] border-[#2a2a3a]",
              step.status === "blocked" && "bg-red-500/40 border-red-500/60",
            )}
          />
        ))}
      </div>
      {/* Progress bar */}
      <div className="h-[3px] bg-[#1a1a26] rounded-sm mt-1.5 overflow-hidden">
        <div
          className="h-full rounded-sm transition-all bg-green-500/70"
          style={{ width: `${pct}%` }}
        />
      </div>
      {worker && (
        <div className="mt-1 flex items-center gap-1" style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 4, color: "#a78bfa" }}>
          <div className="w-[4px] h-[4px] rounded-full bg-green-500 animate-pulse" />
          {worker}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Helper
   ═══════════════════════════════════════════════════════════════ */

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

/* ═══════════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════════ */

export function PixelOffice() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Ufficio" }]);
  }, [setBreadcrumbs]);

  /* ── Data ── */
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 15000,
  });

  const { data: allApprovals } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!),
    queryFn: () => approvalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  /* ── Derived data ── */
  const activeAgents = useMemo(
    () => (agents ?? []).filter((a) => a.status !== "terminated").slice(0, 12),
    [agents],
  );

  const pendingApprovalsByAgent = useMemo(() => {
    const map = new Map<string, Approval[]>();
    for (const a of allApprovals ?? []) {
      if (a.status !== "pending" && a.status !== "revision_requested") continue;
      const agentId = a.requestedByAgentId;
      if (!agentId) continue;
      if (!map.has(agentId)) map.set(agentId, []);
      map.get(agentId)!.push(a);
    }
    return map;
  }, [allApprovals]);

  const lastCommentByAgent = useMemo(() => {
    const map = new Map<string, ActivityEvent>();
    for (const ev of activity ?? []) {
      if (ev.action !== "issue.comment_added" && ev.action !== "issue.commented") continue;
      const agentId = ev.agentId ?? ev.actorId;
      if (!agentId || ev.actorType !== "agent") continue;
      if (!map.has(agentId)) map.set(agentId, ev);
    }
    return map;
  }, [activity]);

  /* ── Layout: assign desk positions in a grid ── */
  const agentPositions = useMemo(() => {
    const positions: { agent: Agent; deskX: number; deskY: number; charX: number; charY: number }[] = [];
    const cols = 4;
    const startX = 200;
    const startY = 160;
    const spacingX = 130;
    const spacingY = 90;

    activeAgents.forEach((agent, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const deskX = startX + col * spacingX;
      const deskY = startY + row * spacingY;
      positions.push({
        agent,
        deskX,
        deskY,
        charX: deskX,
        charY: deskY - 8,
      });
    });
    return positions;
  }, [activeAgents]);

  /* ── Status counts for footer ── */
  const statusCounts = useMemo(() => {
    const counts = { active: 0, idle: 0, paused: 0, error: 0 };
    for (const a of activeAgents) {
      if (a.status === "active" || a.status === "running") counts.active++;
      else if (a.status === "paused") counts.paused++;
      else if (a.status === "error") counts.error++;
      else counts.idle++;
    }
    return counts;
  }, [activeAgents]);

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[#0a0a10]">
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: "#a78bfa" }}>
            🏢 UFFICIO
          </span>
          <div className="flex items-center gap-1.5 ml-3">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] text-muted-foreground">LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> {statusCounts.active} attivi</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-500" /> {statusCounts.idle} idle</span>
          {statusCounts.paused > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {statusCounts.paused} in pausa</span>}
          {statusCounts.error > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {statusCounts.error} errore</span>}
        </div>
      </div>

      {/* Office scene */}
      <div className="flex-1 relative overflow-auto bg-[#0a0a10]">
        {/* Grid floor pattern */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)
            `,
            backgroundSize: "32px 32px",
          }}
        />

        {/* Wall / back area */}
        <div
          className="absolute top-0 left-0 right-0 border-b border-border/30"
          style={{ height: 80, background: "linear-gradient(180deg, #0f0f18, #0a0a10)" }}
        />

        {/* Workflow boards on the wall */}
        <WorkflowBoard
          title="Mokita Copy"
          steps={[
            { status: "done" },
            { status: "done" },
            { status: "active" },
            { status: "todo" },
            { status: "todo" },
          ]}
          worker="Chiara"
          position={{ x: 30, y: 10 }}
        />
        <WorkflowBoard
          title="FRIDA UI"
          steps={[
            { status: "done" },
            { status: "done" },
            { status: "done" },
            { status: "done" },
            { status: "blocked" },
          ]}
          worker="Giulia ⏸"
          position={{ x: 160, y: 10 }}
        />
        <WorkflowBoard
          title="B&B Copy"
          steps={[{ status: "todo" }, { status: "todo" }, { status: "todo" }]}
          position={{ x: 290, y: 10 }}
        />
        <WorkflowBoard
          title="Trendloot"
          steps={[
            { status: "done" },
            { status: "done" },
            { status: "done" },
            { status: "done" },
            { status: "done" },
            { status: "blocked" },
          ]}
          position={{ x: 420, y: 10 }}
        />

        {/* Decorative elements */}
        {/* Plant */}
        <div className="absolute" style={{ left: 560, top: 70 }}>
          <div style={{ width: 8, height: 14, background: "#2d5a3a", borderRadius: "4px 4px 0 0", marginLeft: 4 }} />
          <div style={{ width: 16, height: 10, background: "#1a3a25", borderRadius: "8px 8px 0 0" }} />
          <div style={{ width: 10, height: 6, background: "#5c3d1e", borderRadius: 1, marginLeft: 3 }} />
        </div>
        {/* Water cooler */}
        <div className="absolute" style={{ left: 600, top: 110 }}>
          <div style={{ width: 12, height: 8, background: "#3a7ca5", borderRadius: 2 }} />
          <div style={{ width: 8, height: 16, background: "#88c8e8", borderRadius: 1, marginLeft: 2 }} />
          <div style={{ width: 14, height: 4, background: "#2a2a3a", borderRadius: 1 }} />
        </div>

        {/* Founder desk (special, bottom right) */}
        <div
          className="absolute flex flex-col items-center"
          style={{ right: 60, bottom: 40 }}
        >
          <div className="relative">
            <div
              className="border-2 border-violet-500/50 rounded bg-[#1a1a26] shadow-[0_0_20px_rgba(124,58,237,0.15)]"
              style={{ width: 56, height: 28 }}
            />
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xl">🧑‍💼</div>
          </div>
          <div className="mt-1" style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: "#a78bfa" }}>
            FOUNDER
          </div>
        </div>

        {/* Agent desks + characters */}
        {agentPositions.map(({ agent, deskX, deskY, charX, charY }) => {
          const pendingApprovals = pendingApprovalsByAgent.get(agent.id);
          const lastComment = lastCommentByAgent.get(agent.id);
          const hasPending = pendingApprovals && pendingApprovals.length > 0;
          const snippet = hasPending
            ? (pendingApprovals[0].payload as Record<string, unknown> | null)?.stepTitle as string ??
              pendingApprovals[0].type.replaceAll("_", " ")
            : lastComment
              ? (lastComment.details as Record<string, unknown> | null)?.bodySnippet as string ?? undefined
              : undefined;

          return (
            <div key={agent.id}>
              <IsometricDesk position={{ x: deskX, y: deskY }} status={agent.status} hasMonitor />
              <PixelCharacter
                agent={agent}
                position={{ x: charX, y: charY }}
                hasBubble={!!hasPending || (!!snippet && snippet.length > 0)}
                bubbleText={snippet ? (snippet.length > 50 ? snippet.slice(0, 47) + "..." : snippet) : undefined}
                bubbleUrgent={!!hasPending}
                onClick={() => setChatAgent(agent)}
                isSelected={chatAgent?.id === agent.id}
              />
            </div>
          );
        })}
      </div>

      {/* Chat sheet */}
      <AgentChatSheet
        agent={chatAgent}
        open={chatAgent !== null}
        onOpenChange={(open) => { if (!open) setChatAgent(null); }}
      />
    </div>
  );
}
