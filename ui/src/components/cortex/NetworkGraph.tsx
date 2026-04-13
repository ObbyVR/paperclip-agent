import { useMemo, useState, useRef, useCallback } from "react";
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

  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  // Zoom / pan state
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const lastPinchDist = useRef<number | null>(null);
  const lastPinchScale = useRef(1);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(2.5, Math.max(0.4, s - e.deltaY * 0.001)));
  }, []);

  // Touch pinch-to-zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.hypot(dx, dy);
      lastPinchScale.current = scale;
    }
  }, [scale]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDist.current !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / lastPinchDist.current;
      setScale(Math.min(2.5, Math.max(0.4, lastPinchScale.current * ratio)));
    }
  }, []);

  const handleTouchEnd = useCallback(() => { lastPinchDist.current = null; }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only pan on middle-click or when holding space (detected by e.buttons)
    // For simplicity: any pointer down on background starts pan
    if ((e.target as HTMLElement).closest("button")) return; // don't pan on node clicks
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  }, []);

  const handlePointerUp = useCallback(() => { isPanning.current = false; }, []);

  const resetView = useCallback(() => { setScale(1); setPan({ x: 0, y: 0 }); }, []);

  const showResetBtn = scale !== 1 || pan.x !== 0 || pan.y !== 0;

  return (
    <div
      className={cn("relative flex flex-1 items-center justify-center overflow-hidden", className)}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ cursor: isPanning.current ? "grabbing" : "default", touchAction: "none" }}
    >
      {/* Zoom indicator + reset */}
      {showResetBtn && (
        <button
          onClick={resetView}
          className="absolute right-3 top-3 z-20 rounded-md border border-white/[0.08] bg-[#161a27]/90 px-2.5 py-1 text-[10px] text-white/50 backdrop-blur-sm transition-all hover:text-white/80"
        >
          {Math.round(scale * 100)}% — Reset
        </button>
      )}

      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "center center", transition: isPanning.current ? "none" : "transform 0.15s ease-out" }}>
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
              <line
                key={`l-${a.id}`}
                x1={cx} y1={cy} x2={a.x} y2={a.y}
                className={cn(
                  "transition-opacity duration-200",
                  hoveredAgentId && hoveredAgentId !== a.id ? "opacity-[0.03] stroke-1" : `stroke-1 ${LINE_CLS[a.status]}`,
                  hoveredAgentId === a.id && "stroke-2 opacity-60",
                )}
                style={hoveredAgentId === a.id ? { filter: "drop-shadow(0 0 6px rgba(129,140,248,0.4))" } : undefined}
              />
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
              onHover={setHoveredAgentId}
              animationDelay={`${i * 0.06}s`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
