/**
 * DepartmentRoom — A styled card containing a grid of agent desks.
 *
 * Shows department name, agent count, status indicators, pulsing border,
 * department-specific decorations, and leader badge.
 */
import { useState } from "react";
import type { Agent, Approval, ActivityEvent } from "@paperclipai/shared";
import { flattenDepartment, getDeptTheme, type DepartmentGroup } from "../../lib/departmentGroups";
import { DeskUnit } from "./DeskUnit";
import { AgentHoverCard } from "./AgentHoverCard";

/* ── Department-specific decoration config ── */
interface DeptDecor {
  icon: string;
  label: string;
  items: Array<{ src: string; w: number; h: number; position: "top-right" | "bottom-left" | "bottom-right" }>;
}

function getDeptDecor(role: string): DeptDecor {
  switch (role) {
    case "engineer":
    case "cto":
    case "devops":
      return {
        icon: "💻",
        label: "TECH",
        items: [
          { src: "/sprites/office/old-printer.png", w: 26, h: 24, position: "bottom-right" },
          { src: "/sprites/office/plant.png", w: 24, h: 34, position: "bottom-left" },
        ],
      };
    case "designer":
      return {
        icon: "🎨",
        label: "CREATIVE",
        items: [
          { src: "/sprites/office/plant.png", w: 28, h: 40, position: "bottom-right" },
          { src: "/sprites/office/coffee-machine.png", w: 22, h: 28, position: "bottom-left" },
        ],
      };
    case "researcher":
      return {
        icon: "🔬",
        label: "RESEARCH",
        items: [
          { src: "/sprites/office/plant.png", w: 24, h: 34, position: "bottom-right" },
          { src: "/sprites/office/watercooler.png", w: 20, h: 30, position: "bottom-left" },
        ],
      };
    case "cmo":
    case "pm":
      return {
        icon: "📊",
        label: "MARKETING",
        items: [
          { src: "/sprites/office/watercooler.png", w: 22, h: 32, position: "bottom-right" },
          { src: "/sprites/office/plant.png", w: 24, h: 34, position: "bottom-left" },
        ],
      };
    case "cfo":
      return {
        icon: "💰",
        label: "FINANCE",
        items: [
          { src: "/sprites/office/old-printer.png", w: 24, h: 22, position: "bottom-right" },
          { src: "/sprites/office/plant.png", w: 24, h: 34, position: "bottom-left" },
        ],
      };
    default:
      return {
        icon: "🏢",
        label: "TEAM",
        items: [
          { src: "/sprites/office/watercooler.png", w: 22, h: 32, position: "bottom-right" },
          { src: "/sprites/office/plant.png", w: 24, h: 34, position: "bottom-left" },
        ],
      };
  }
}

const POSITION_CLASSES: Record<string, string> = {
  "top-right": "absolute top-10 right-2",
  "bottom-left": "absolute bottom-2 left-2",
  "bottom-right": "absolute bottom-2 right-2",
};

interface DepartmentRoomProps {
  department: DepartmentGroup;
  pendingApprovals: Map<string, Approval[]>;
  lastComments: Map<string, ActivityEvent>;
  onAgentClick: (agent: Agent) => void;
}

export function DepartmentRoom({ department, pendingApprovals, lastComments, onAgentClick }: DepartmentRoomProps) {
  // Start collapsed on mobile (<640px)
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const allAgents = flattenDepartment(department);
  const theme = getDeptTheme(department.leader.role);
  const hasError = allAgents.some((a) => a.status === "error");
  const hasActive = allAgents.some((a) => a.status === "active" || a.status === "running");
  const leaderName = department.leader.name.split("—")[1]?.trim() ?? department.leader.name.split("—")[0]?.trim() ?? "Team";
  const decor = getDeptDecor(department.leader.role);

  const borderStyle = hasError
    ? { borderColor: "rgba(239,68,68,0.5)", animation: "pulse-border-red 2s ease-in-out infinite" }
    : hasActive
      ? { borderColor: "rgba(34,197,94,0.4)", animation: "pulse-border-green 2s ease-in-out infinite" }
      : { borderColor: theme.accent + "40" };

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        backgroundColor: theme.accent + "08",
        boxShadow: `0 4px 20px ${theme.accent}10, 0 1px 4px rgba(0,0,0,0.3)`,
        ...borderStyle,
      }}
    >
      {/* Header — clickable to collapse/expand */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2 cursor-pointer hover:brightness-110 transition-all"
        style={{ backgroundColor: theme.accent + "15" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]">{decor.icon}</span>
          <span className="text-[11px] font-bold tracking-wide" style={{ color: theme.accent }}>
            {leaderName.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {hasError && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
          {hasActive && !hasError && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
          <span className="text-[10px]" style={{ color: theme.accent + "80" }}>
            {allAgents.length}
          </span>
          <span className="text-[9px] transition-transform duration-200" style={{ color: theme.accent + "60", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
        </div>
      </button>

      {/* Collapsible body */}
      {!collapsed && <>
      {/* Agent grid + decorations */}
      <div className="relative p-4 pt-3">
        {/* Department-specific decorative items */}
        {decor.items.map((item, i) => (
          <img
            key={i}
            src={item.src}
            alt=""
            className={`${POSITION_CLASSES[item.position]} opacity-50 pointer-events-none`}
            style={{ width: item.w, height: item.h, imageRendering: "pixelated" }}
            draggable={false}
          />
        ))}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 place-items-center">
          {allAgents.map((agent, idx) => (
            <AgentHoverCard
              key={agent.id}
              agent={agent}
              pending={pendingApprovals.get(agent.id)}
              lastComment={lastComments.get(agent.id)}
              isLeader={agent.id === department.leader.id}
            >
              <div style={{ animation: `agent-enter 400ms ease-out ${idx * 80}ms both` }}>
                <DeskUnit
                  agent={agent}
                  pending={pendingApprovals.get(agent.id)}
                  lastComment={lastComments.get(agent.id)}
                  onClick={() => onAgentClick(agent)}
                  isLeader={agent.id === department.leader.id}
                />
              </div>
            </AgentHoverCard>
          ))}
        </div>
      </div>

      {/* Stats footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t" style={{ borderColor: theme.accent + "15" }}>
        {(() => {
          const active = allAgents.filter((a) => a.status === "active" || a.status === "running").length;
          const idle = allAgents.filter((a) => a.status === "idle").length;
          const paused = allAgents.filter((a) => a.status === "paused").length;
          const error = allAgents.filter((a) => a.status === "error").length;
          const pendingCount = allAgents.reduce((sum, a) => sum + (pendingApprovals.get(a.id)?.length ?? 0), 0);
          return (
            <>
              <div className="flex items-center gap-2.5 text-[9px]">
                {active > 0 && <span className="flex items-center gap-1 text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{active}</span>}
                {idle > 0 && <span className="flex items-center gap-1 text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-slate-500" />{idle}</span>}
                {paused > 0 && <span className="flex items-center gap-1 text-amber-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{paused}</span>}
                {error > 0 && <span className="flex items-center gap-1 text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{error}</span>}
              </div>
              {pendingCount > 0 && (
                <span className="text-[9px] text-red-400 font-medium">{pendingCount} in attesa</span>
              )}
            </>
          );
        })()}
      </div>

      {/* Ambient particles for active rooms — larger, more visible */}
      {hasActive && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="absolute rounded-full opacity-0"
              style={{
                width: 2 + (i % 2),
                height: 2 + (i % 2),
                backgroundColor: theme.accent,
                left: `${10 + i * 16}%`,
                bottom: 0,
                animation: `float-particle ${3.5 + i * 0.6}s ease-in-out ${i * 0.5}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      </>}

      {/* CSS keyframes */}
      <style>{`
        @keyframes pulse-border-red {
          0%, 100% { border-color: rgba(239,68,68,0.3); }
          50% { border-color: rgba(239,68,68,0.6); }
        }
        @keyframes pulse-border-green {
          0%, 100% { border-color: rgba(34,197,94,0.25); }
          50% { border-color: rgba(34,197,94,0.5); }
        }
        @keyframes float-particle {
          0% { transform: translateY(0); opacity: 0; }
          20% { opacity: 0.5; }
          60% { opacity: 0.3; }
          100% { transform: translateY(-100px); opacity: 0; }
        }
        @keyframes agent-enter {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
