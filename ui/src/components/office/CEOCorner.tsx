/**
 * CEOCorner — Compact CEO area for the open-space layout.
 *
 * Replaces the large CEOOffice card. Shows just the CEO at a desk
 * with a small window, a plant, and a subtle gold accent. Meant to
 * occupy a corner of the office, not dominate the layout.
 */
import type { Agent, Approval, ActivityEvent } from "@paperclipai/shared";
import { DeskUnit } from "./DeskUnit";

interface CEOCornerProps {
  ceo: Agent;
  pending?: Approval[];
  lastComment?: ActivityEvent;
  onClick: () => void;
}

export function CEOCorner({ ceo, pending, lastComment, onClick }: CEOCornerProps) {
  return (
    <div className="relative flex flex-col items-center gap-1 pr-4" style={{ width: 160 }}>
      {/* Small window with city skyline (deterministic, no flicker) */}
      <div className="relative w-28 h-12 rounded border border-slate-700/40 overflow-hidden mb-1"
        style={{ background: "linear-gradient(180deg, #0a0e1a 0%, #121830 60%, #1a2040 100%)" }}>
        {/* Buildings */}
        <div className="absolute bottom-0 w-full flex items-end justify-center gap-[1px] px-1">
          {[14, 20, 12, 22, 16, 18, 10, 20, 14].map((h, i) => (
            <div key={i} className="bg-slate-800/80" style={{ width: 4 + (i % 2) * 2, height: h, borderRadius: "1px 1px 0 0" }}>
              {Array.from({ length: Math.floor(h / 5) }).map((_, j) => {
                const lit = ((i * 7 + j * 13 + 3) % 5) > 1;
                return (
                  <div key={j} className="mx-auto mt-[2px]" style={{
                    width: 1.5, height: 1.5,
                    backgroundColor: lit ? "rgba(255,220,120,0.5)" : "transparent",
                  }} />
                );
              })}
            </div>
          ))}
        </div>
        {/* Stars */}
        {[{ x: 8, y: 3 }, { x: 55, y: 5 }, { x: 90, y: 2 }, { x: 30, y: 4 }].map((s, i) => (
          <div key={i} className="absolute rounded-full" style={{
            left: s.x, top: s.y, width: 1.5, height: 1.5,
            backgroundColor: "rgba(255,255,255,0.5)",
            animation: `twinkle ${2 + i * 0.5}s ease-in-out ${i * 0.4}s infinite`,
          }} />
        ))}
      </div>

      {/* CEO label */}
      <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-amber-600/40 bg-amber-950/20">
        <span className="text-[9px]">★</span>
        <span className="text-[9px] font-bold text-amber-400 tracking-wider">CEO</span>
      </div>

      {/* CEO desk with agent */}
      <DeskUnit agent={ceo} pending={pending} lastComment={lastComment} onClick={onClick} variant="ceo" isLeader={true} />

      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
