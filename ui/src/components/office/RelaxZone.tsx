/**
 * RelaxZone — Integrated lounge area (no card, no border).
 *
 * Replaces BreakArea. Shows paused and socializing agents in a
 * continuous space with couches, coffee machine, and plants.
 * Agents use varied poses: sitting-couch, standing-coffee, standing-chat.
 */
import type { Agent } from "@paperclipai/shared";
import { PixelAgent } from "./PixelAgent";
import { AgentHoverCard } from "./AgentHoverCard";

interface RelaxZoneProps {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
}

/** Pick a relax pose for an agent based on hash */
function pickRelaxPose(agentId: string): string {
  const h = agentId.charCodeAt(0) + agentId.charCodeAt(agentId.length - 1);
  const variant = h % 3;
  if (variant === 0) return "sitting-couch";
  if (variant === 1) return "standing-coffee";
  return "standing-chat";
}

export function RelaxZone({ agents, onAgentClick }: RelaxZoneProps) {
  if (agents.length === 0) return null;

  return (
    <div className="relative flex flex-col items-center gap-2 py-6">
      {/* Floating label — wooden sign */}
      <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full border-2 border-amber-600/70 bg-amber-50/95 shadow-lg"
        style={{ boxShadow: "0 4px 12px rgba(28,14,4,0.5), inset 0 1px 0 rgba(255,255,255,0.6)" }}>
        <span className="text-[10px]">☕</span>
        <span className="text-[9px] font-bold tracking-wider text-amber-800">AREA RELAX</span>
        <span className="text-[9px] text-amber-700">· {agents.length}</span>
      </div>

      {/* Background: couch sprites, coffee machine, plants — integrated not card */}
      <div className="relative w-full max-w-[700px] h-[180px]">
        {/* Warm rug — amber carpet with soft glow */}
        <div className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            backgroundColor: "rgba(217,119,6,0.18)",
            boxShadow: "0 0 40px rgba(217,119,6,0.15), inset 0 0 30px rgba(120,53,15,0.2)",
          }} />

        {/* Decorative background: couches + coffee machine */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-8 opacity-70 pointer-events-none">
          {/* Couch left */}
          <div className="flex items-end gap-0">
            <div className="w-20 h-8 rounded-t bg-amber-700/70 border-t-2 border-x border-amber-800/50" />
            <div className="w-4 h-10 rounded-t bg-amber-700/60 border-t border-x border-amber-800/40" />
          </div>
          {/* Plant */}
          <img src="/sprites/office/plant.png" alt="" style={{ width: 32, height: 44, imageRendering: "pixelated" }} draggable={false} />
          {/* Coffee machine + watercooler */}
          <div className="flex items-end gap-2">
            <img src="/sprites/office/coffee-machine.png" alt="" style={{ width: 28, height: 36, imageRendering: "pixelated" }} draggable={false} />
            <img src="/sprites/office/watercooler.png" alt="" style={{ width: 22, height: 32, imageRendering: "pixelated" }} draggable={false} />
          </div>
          {/* Couch right */}
          <div className="flex items-end gap-0">
            <div className="w-4 h-10 rounded-t bg-amber-700/60 border-t border-x border-amber-800/40" />
            <div className="w-20 h-8 rounded-t bg-amber-700/70 border-t-2 border-x border-amber-800/50" />
          </div>
        </div>

        {/* Agents distributed across the zone with varied poses */}
        <div className="relative flex items-end justify-center gap-5 pt-4 h-full">
          {agents.map((agent, idx) => {
            const firstName = agent.name.split("—")[0]?.trim().split(" ")[0] ?? "";
            const pose = pickRelaxPose(agent.id);
            return (
              <AgentHoverCard key={agent.id} agent={agent}>
                <button
                  type="button"
                  onClick={() => onAgentClick(agent)}
                  className="flex flex-col items-center gap-1 cursor-pointer group focus:outline-none transition-transform duration-200 hover:scale-105"
                  title={`${agent.name} — In pausa`}
                  style={{ animation: `relax-enter 600ms ease-out ${idx * 120}ms both` }}
                >
                  <div className="group-hover:brightness-110 transition-all">
                    <PixelAgent agentId={agent.id} status={pose} scale={1.2} />
                  </div>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50/95 border border-amber-800/50 shadow-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span className="text-[9px] text-stone-900 font-medium">{firstName}</span>
                  </div>
                </button>
              </AgentHoverCard>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes relax-enter {
          0% { opacity: 0; transform: translateX(30px) scale(0.9); }
          60% { opacity: 1; transform: translateX(-3px) scale(1.02); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
