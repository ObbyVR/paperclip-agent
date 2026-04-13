import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "./AgentAvatar";
import { cortexStatusStyles, cortexStatusIcon, cortexStatusPulses } from "@/lib/cortex-status";
import type { CortexStatus } from "@/lib/cortex-status";

export interface AgentNodeData {
  id: string;
  name: string;
  icon?: string;
  role?: string;
  currentTask?: string;
  status: CortexStatus;
  /** If set, renders a colored initial badge instead of DiceBear avatar (for projects) */
  color?: string;
  /** Extra tooltip lines (e.g. issue count, cost) */
  tooltipExtra?: string[];
}

interface AgentNodeProps {
  agent: AgentNodeData;
  style?: React.CSSProperties;
  onClick?: () => void;
  animationDelay?: string;
  onHover?: (id: string | null) => void;
}

const STATUS_LABEL: Record<CortexStatus, string> = {
  working: "In corso",
  "needs-me": "Richiede azione",
  done: "Completato",
  error: "Errore",
  idle: "Inattivo",
};

/** Colored circle with initial — used for project nodes */
function ProjectBadge({ name, color, status }: { name: string; color: string; status: CortexStatus }) {
  const s = cortexStatusStyles[status];
  const dotIcon = cortexStatusIcon(status);
  const pulses = cortexStatusPulses(status);
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        "relative flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full border-2",
        s.border, s.glow,
        status === "idle" && "opacity-50",
      )}
      style={{ backgroundColor: color + "20" }}
    >
      <span className="text-[20px] font-bold" style={{ color }}>{initial}</span>
      {status !== "idle" && (
        <div className={cn(
          "absolute -right-px -top-px flex h-4 w-4 items-center justify-center rounded-full border-[2.5px] border-[#060810]",
          s.dot, pulses && "animate-pulse",
        )}>
          {dotIcon && <span className="text-[7px] font-extrabold leading-none text-[#0b0d15]">{dotIcon}</span>}
        </div>
      )}
    </div>
  );
}

export function AgentNode({ agent, style, onClick, animationDelay, onHover }: AgentNodeProps) {
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const s = cortexStatusStyles[agent.status];

  const showTooltip = () => {
    hoverTimer.current = setTimeout(() => setHovered(true), 280);
    onHover?.(agent.id);
  };
  const hideTooltip = () => {
    clearTimeout(hoverTimer.current);
    setHovered(false);
    onHover?.(null);
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      className="absolute z-[4] flex w-[120px] -translate-x-1/2 flex-col items-center gap-[5px] transition-transform duration-150 hover:scale-110 animate-[float-in_0.5s_ease-out_backwards]"
      style={{ ...style, animationDelay }}
    >
      {agent.color ? (
        <ProjectBadge name={agent.name} color={agent.color} status={agent.status} />
      ) : (
        <AgentAvatar name={agent.name} status={agent.status} size="md" />
      )}
      <span className="max-w-full truncate text-center text-[11px] font-semibold text-white">{agent.name}</span>
      {agent.role && <span className="-mt-1 max-w-full truncate text-center text-[9px] text-white/45">{agent.role}</span>}
      {agent.currentTask && (
        <span className="-mt-0.5 max-w-full truncate rounded-md border border-white/[0.05] bg-[#1e2233] px-2.5 py-0.5 text-center text-[9.5px] text-white/60 backdrop-blur-sm">
          {agent.currentTask}
        </span>
      )}

      {/* Hover tooltip */}
      {hovered && (
        <div className="pointer-events-none absolute -top-2 left-1/2 z-50 -translate-x-1/2 -translate-y-full animate-[float-in_0.15s_ease-out]">
          <div className="flex min-w-[160px] max-w-[220px] flex-col gap-1.5 rounded-lg border border-white/[0.08] bg-[#161a27]/95 px-3.5 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", s.dot)} />
              <span className={cn("text-[11px] font-medium", s.text)}>{STATUS_LABEL[agent.status]}</span>
            </div>
            {agent.role && (
              <span className="text-[10px] text-white/55">{agent.role}</span>
            )}
            {agent.currentTask && (
              <span className="text-[10px] text-white/40">Task: {agent.currentTask}</span>
            )}
            {agent.tooltipExtra?.map((line, i) => (
              <span key={i} className="text-[10px] text-white/40">{line}</span>
            ))}
          </div>
          <div className="mx-auto h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-[#161a27]/95" />
        </div>
      )}
    </button>
  );
}
