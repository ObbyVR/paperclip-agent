/**
 * BreakArea — Lounge area showing paused/idle agents.
 *
 * Agents here are "away from their desk": having coffee, chatting,
 * or resting. Visual cue that their chair at the desk is empty.
 */
import { useEffect, useState } from "react";
import type { Agent } from "@paperclipai/shared";
import { PixelAgent } from "./PixelAgent";

interface BreakAreaProps {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
}

/** Track which agents are still in their "walking in" entrance phase */
function useWalkingAgents(agents: Agent[]): Set<string> {
  const [walking, setWalking] = useState<Set<string>>(new Set());
  useEffect(() => {
    // Mark new agents as walking
    const newIds = agents.map((a) => a.id);
    setWalking((prev) => {
      const next = new Set(prev);
      for (const id of newIds) if (!prev.has(id)) next.add(id);
      return next;
    });
    // After 800ms, clear walking state for all
    const timer = setTimeout(() => setWalking(new Set()), 800);
    return () => clearTimeout(timer);
  }, [agents.map((a) => a.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return walking;
}

export function BreakArea({ agents, onAgentClick }: BreakAreaProps) {
  const walkingIds = useWalkingAgents(agents);
  if (agents.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-600/20 overflow-hidden" style={{ backgroundColor: "rgba(30,23,16,0.5)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5" style={{ backgroundColor: "rgba(245,158,11,0.08)" }}>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]">☕</span>
          <span className="text-[11px] font-bold tracking-wide text-amber-400/70">AREA RELAX</span>
        </div>
        <span className="text-[10px] text-amber-400/50">{agents.length}</span>
      </div>

      {/* Lounge content */}
      <div className="relative px-4 py-3">
        {/* Background: couch + coffee machine */}
        <div className="absolute inset-0 flex items-end justify-between px-3 pb-2 opacity-40 pointer-events-none">
          {/* Couch (CSS drawn) */}
          <div className="flex items-end gap-0.5">
            <div className="w-16 h-6 rounded-t bg-amber-900/50 border-t border-x border-amber-700/30" />
            <div className="w-4 h-8 rounded-t bg-amber-900/40 border-t border-x border-amber-700/20" />
          </div>
          {/* Coffee machine */}
          <img src="/sprites/office/coffee-machine.png" alt="" style={{ width: 24, height: 32, imageRendering: "pixelated" }} draggable={false} />
        </div>

        {/* Agents in break */}
        <div className="relative flex flex-wrap justify-center gap-6">
          {agents.map((agent, idx) => {
            const firstName = agent.name.split("—")[0]?.trim().split(" ")[0] ?? "";
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => onAgentClick(agent)}
                className="flex flex-col items-center gap-1 cursor-pointer group focus:outline-none transition-transform duration-200 hover:scale-105"
                title={`${agent.name} — ${agent.status === "paused" ? "In pausa" : "Disponibile"}`}
                style={{ animation: `walk-in 600ms ease-out ${idx * 150}ms both` }}
              >
                <div className="group-hover:brightness-110 transition-all">
                  <PixelAgent agentId={agent.id} status={walkingIds.has(agent.id) ? "walking" : agent.status} scale={1.2} />
                </div>
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-700/30">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: agent.status === "paused" ? "#f59e0b" : "#6b7280" }} />
                  <span className="text-[9px] text-amber-200/70 font-medium">{firstName}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes walk-in {
          0% { opacity: 0; transform: translateX(40px) scale(0.9); }
          60% { opacity: 1; transform: translateX(-4px) scale(1.02); }
          80% { transform: translateX(2px) scale(1); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
