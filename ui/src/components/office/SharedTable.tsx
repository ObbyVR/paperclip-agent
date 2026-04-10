/**
 * SharedTable — Open-space shared table for a department.
 *
 * Replaces the DepartmentRoom card. Shows a long table sprite with
 * agents seated side-by-side (using DeskUnit for each seat), a floating
 * zone label above, and optional standing agents next to the table.
 */
import type { Agent, Approval, ActivityEvent } from "@paperclipai/shared";
import { DeskUnit } from "./DeskUnit";
import { AgentHoverCard } from "./AgentHoverCard";
import { PixelAgent } from "./PixelAgent";

interface SharedTableProps {
  /** Department label (e.g. "TECH LEAD", "CREATIVE") */
  label: string;
  /** Icon emoji for the zone */
  icon: string;
  /** Accent color for the zone (hex) */
  accent: string;
  /** Leader of the department */
  leader: Agent;
  /** Seated agents (working/idle at the table) */
  seated: Agent[];
  /** Standing agents near the table (chatting, walking) */
  standing: Agent[];
  pendingApprovals: Map<string, Approval[]>;
  lastComments: Map<string, ActivityEvent>;
  onAgentClick: (agent: Agent) => void;
}

export function SharedTable({
  label,
  icon,
  accent,
  leader,
  seated,
  standing,
  pendingApprovals,
  lastComments,
  onAgentClick,
}: SharedTableProps) {
  // Include leader in seated list (always at the table)
  const allSeated = [leader, ...seated];

  return (
    <div className="relative flex flex-col items-center">
      {/* Floating zone label — wooden hanging sign */}
      <div className="mb-2 flex items-center gap-1.5 px-3 py-1 rounded-full border-2 bg-amber-50/95 backdrop-blur-sm"
        style={{
          borderColor: accent + "aa",
          boxShadow: `0 4px 12px rgba(28,14,4,0.5), 0 0 0 1px ${accent}40, inset 0 1px 0 rgba(255,255,255,0.6)`,
        }}>
        <span className="text-[11px]">{icon}</span>
        <span className="text-[10px] font-bold tracking-wider" style={{ color: accent }}>
          {label}
        </span>
      </div>

      {/* Subtle zone rug — warm tint with soft edges */}
      <div className="absolute top-10 left-0 right-0 bottom-0 rounded-lg pointer-events-none -z-10"
        style={{
          backgroundColor: accent + "15",
          boxShadow: `0 2px 16px ${accent}20`,
        }} />

      {/* Seated agents — side by side at the shared table */}
      <div className="flex items-end justify-center gap-1 flex-wrap">
        {allSeated.map((agent, idx) => (
          <AgentHoverCard
            key={agent.id}
            agent={agent}
            pending={pendingApprovals.get(agent.id)}
            lastComment={lastComments.get(agent.id)}
            isLeader={agent.id === leader.id}
          >
            <div style={{ animation: `seat-enter 400ms ease-out ${idx * 60}ms both` }}>
              <DeskUnit
                agent={agent}
                pending={pendingApprovals.get(agent.id)}
                lastComment={lastComments.get(agent.id)}
                onClick={() => onAgentClick(agent)}
                isLeader={agent.id === leader.id}
              />
            </div>
          </AgentHoverCard>
        ))}
      </div>

      {/* Standing agents (chatting near the table) */}
      {standing.length > 0 && (
        <div className="flex items-end justify-center gap-3 mt-2 mb-1">
          {standing.map((agent, idx) => {
            const firstName = agent.name.split("—")[0]?.trim().split(" ")[0] ?? "";
            // Assign standing pose by hash: chat, coffee, or walking
            const h = agent.id.charCodeAt(0) + agent.id.charCodeAt(agent.id.length - 1);
            const standingStatus = h % 3 === 0 ? "standing-chat" : h % 3 === 1 ? "standing-coffee" : "walking";
            return (
              <AgentHoverCard
                key={agent.id}
                agent={agent}
                pending={pendingApprovals.get(agent.id)}
                lastComment={lastComments.get(agent.id)}
              >
                <button
                  type="button"
                  onClick={() => onAgentClick(agent)}
                  className="flex flex-col items-center gap-0.5 cursor-pointer group focus:outline-none transition-transform hover:scale-105"
                  style={{ animation: `stand-enter 500ms ease-out ${(idx + allSeated.length) * 80}ms both` }}
                >
                  <div className="group-hover:brightness-110 transition-all">
                    <PixelAgent agentId={agent.id} status={standingStatus} scale={1.1} />
                  </div>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50/95 border border-amber-900/40 shadow-md">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#6b7280" }} />
                    <span className="text-[8px] text-stone-800 font-medium truncate max-w-[50px]">{firstName}</span>
                  </div>
                </button>
              </AgentHoverCard>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes seat-enter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes stand-enter {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
