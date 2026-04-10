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
      {/* Small window — daylight sky with clouds */}
      <div className="relative w-28 h-12 rounded border border-slate-400/60 overflow-hidden mb-1 shadow-sm"
        style={{ background: "linear-gradient(180deg, #bae6fd 0%, #e0f2fe 60%, #fef3c7 100%)" }}>
        {/* Buildings silhouette (pale) */}
        <div className="absolute bottom-0 w-full flex items-end justify-center gap-[1px] px-1 opacity-40">
          {[14, 20, 12, 22, 16, 18, 10, 20, 14].map((h, i) => (
            <div key={i} className="bg-slate-500/60" style={{ width: 4 + (i % 2) * 2, height: h, borderRadius: "1px 1px 0 0" }} />
          ))}
        </div>
        {/* Sun */}
        <div className="absolute rounded-full" style={{
          left: 80, top: 3, width: 8, height: 8,
          background: "radial-gradient(circle, #fef08a 0%, #fde047 60%, transparent 100%)",
          boxShadow: "0 0 6px rgba(253,224,71,0.6)",
        }} />
        {/* Clouds */}
        {[{ x: 10, y: 4, w: 12 }, { x: 40, y: 7, w: 10 }].map((c, i) => (
          <div key={i} className="absolute rounded-full" style={{
            left: c.x, top: c.y, width: c.w, height: 3,
            backgroundColor: "rgba(255,255,255,0.9)",
            animation: `cloud-drift ${20 + i * 5}s linear ${i * 3}s infinite`,
          }} />
        ))}
      </div>

      {/* CEO label */}
      <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-amber-500/70 bg-white/95 shadow-sm">
        <span className="text-[9px]">★</span>
        <span className="text-[9px] font-bold text-amber-700 tracking-wider">CEO</span>
      </div>

      {/* CEO desk with agent */}
      <DeskUnit agent={ceo} pending={pending} lastComment={lastComment} onClick={onClick} variant="ceo" isLeader={true} />

      <style>{`
        @keyframes cloud-drift {
          0% { transform: translateX(0); }
          100% { transform: translateX(90px); }
        }
      `}</style>
    </div>
  );
}
