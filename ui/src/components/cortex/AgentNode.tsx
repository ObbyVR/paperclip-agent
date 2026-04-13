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
}

interface AgentNodeProps {
  agent: AgentNodeData;
  style?: React.CSSProperties;
  onClick?: () => void;
  animationDelay?: string;
}

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

export function AgentNode({ agent, style, onClick, animationDelay }: AgentNodeProps) {
  return (
    <button
      onClick={onClick}
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
    </button>
  );
}
