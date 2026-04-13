import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CeoNode } from "./CeoNode";
import { AgentNode } from "./AgentNode";
import type { AgentNodeData } from "./AgentNode";

interface NetworkGraphProps {
  agents: AgentNodeData[];
  onAgentClick?: (agentId: string) => void;
  className?: string;
}

const BASE_W = 680;
const BASE_H = 600;

/** Scale graph size and radius based on agent count to prevent overlap */
function graphDimensions(agentCount: number) {
  // Each agent needs ~90px of arc space to avoid label overlap
  const minCircumference = agentCount * 90;
  const minRadius = Math.max(210, minCircumference / (2 * Math.PI));
  const radius = Math.min(minRadius, 400); // cap at 400 to fit screens
  const w = Math.max(BASE_W, radius * 2 + 160);
  const h = Math.max(BASE_H, radius * 2 + 160);
  return { w, h, cx: w / 2, cy: h / 2 - 10, radius };
}

function layoutAgents(agents: AgentNodeData[]) {
  const n = agents.length;
  if (n === 0) return [];
  const { cx, cy, radius } = graphDimensions(n);
  const start = -Math.PI / 2;
  return agents.map((agent, i) => {
    const angle = start + (2 * Math.PI * i) / n;
    return { ...agent, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
}

const LINE_CLS: Record<string, string> = {
  working: "stroke-[#67e8f9] opacity-20 [stroke-dasharray:6_4]",
  "needs-me": "stroke-[#fcd34d] opacity-25 [stroke-dasharray:4_4]",
  done: "stroke-[#6ee7b7] opacity-[0.12]",
  error: "stroke-[#fca5a5] opacity-20 [stroke-dasharray:3_3]",
  idle: "stroke-white/[0.04]",
};

export function NetworkGraph({ agents, onAgentClick, className }: NetworkGraphProps) {
  const positioned = useMemo(() => layoutAgents(agents), [agents]);
  const dims = useMemo(() => graphDimensions(agents.length), [agents.length]);
  const { w, h, cx, cy } = dims;

  return (
    <div className={cn("relative flex flex-1 items-center justify-center overflow-auto", className)}>
      {/* Orbital rings */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-400/[0.04]" style={{ width: dims.radius * 2 + 200, height: dims.radius * 2 + 200 }} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-indigo-400/[0.035]" style={{ width: dims.radius * 2 + 60, height: dims.radius * 2 + 60 }} />
      <div className="absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-400/[0.06]" />

      <div className="relative" style={{ width: w, height: h }}>
        {/* SVG lines + particles */}
        <svg className="pointer-events-none absolute inset-0 z-[1]" viewBox={`0 0 ${w} ${h}`} fill="none">
          <defs>
            {positioned.map((a) => (
              <path key={`p-${a.id}`} id={`cortex-path-${a.id}`} d={`M${cx},${cy} L${a.x},${a.y}`} />
            ))}
          </defs>
          {positioned.map((a) => (
            <line key={`l-${a.id}`} x1={cx} y1={cy} x2={a.x} y2={a.y} className={`stroke-1 ${LINE_CLS[a.status]}`} />
          ))}
          {positioned
            .filter((a) => a.status === "working" || a.status === "needs-me")
            .map((a) => (
              <circle
                key={`o-${a.id}`}
                r={2.5}
                className={a.status === "working"
                  ? "fill-[#67e8f9] [filter:drop-shadow(0_0_4px_#67e8f9)]"
                  : "fill-[#fcd34d] [filter:drop-shadow(0_0_4px_#fcd34d)]"
                }
              >
                <animateMotion dur={a.status === "working" ? "2.8s" : "2.5s"} repeatCount="indefinite">
                  <mpath href={`#cortex-path-${a.id}`} />
                </animateMotion>
              </circle>
            ))}
        </svg>

        <CeoNode />

        {positioned.map((agent, i) => (
          <AgentNode
            key={agent.id}
            agent={agent}
            style={{ left: agent.x, top: agent.y - 28 }}
            onClick={() => onAgentClick?.(agent.id)}
            animationDelay={`${i * 0.06}s`}
          />
        ))}
      </div>
    </div>
  );
}
