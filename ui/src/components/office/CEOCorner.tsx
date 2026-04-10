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
      {/* Golden hour window — wooden frame with warm sunset */}
      <div className="relative w-28 h-14 rounded overflow-hidden mb-1"
        style={{
          border: "3px solid #3a2818",
          boxShadow: "0 6px 16px rgba(28,14,4,0.6), inset 0 2px 4px rgba(0,0,0,0.4)",
          background: "linear-gradient(180deg, #fde68a 0%, #fbbf24 40%, #f97316 75%, #7c2d12 100%)",
        }}>
        {/* Cross bars of window frame */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 bg-stone-900/60 z-10" />
        <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-stone-900/60 z-10" />
        {/* Distant mountains silhouette */}
        <div className="absolute bottom-0 w-full h-4" style={{
          background: "linear-gradient(180deg, transparent 0%, rgba(61,26,8,0.6) 100%)",
          clipPath: "polygon(0 100%, 0 60%, 10% 40%, 20% 55%, 30% 30%, 40% 50%, 50% 35%, 60% 55%, 70% 30%, 85% 50%, 100% 40%, 100% 100%)",
        }} />
        {/* Sun — large glowing orb */}
        <div className="absolute rounded-full z-0" style={{
          left: 62, top: 10, width: 14, height: 14,
          background: "radial-gradient(circle, #fff7d6 0%, #fef08a 30%, #fbbf24 60%, transparent 100%)",
          boxShadow: "0 0 18px rgba(251,191,36,0.9), 0 0 36px rgba(251,146,60,0.5)",
          animation: "sun-glow 4s ease-in-out infinite",
        }} />
        {/* Light rays */}
        <div className="absolute inset-0 pointer-events-none z-0" style={{
          background: "radial-gradient(circle at 72% 35%, rgba(255,243,200,0.35) 0%, transparent 40%)",
        }} />
      </div>

      {/* CEO label — brass plaque */}
      <div className="flex items-center gap-1 px-2 py-0.5 rounded border-2 bg-amber-50/95"
        style={{
          borderColor: "#b45309",
          boxShadow: "0 4px 10px rgba(28,14,4,0.5), inset 0 1px 0 rgba(255,255,255,0.6)",
        }}>
        <span className="text-[9px]">★</span>
        <span className="text-[9px] font-bold text-amber-900 tracking-wider">CEO</span>
      </div>

      {/* CEO desk with agent */}
      <DeskUnit agent={ceo} pending={pending} lastComment={lastComment} onClick={onClick} variant="ceo" isLeader={true} />

      <style>{`
        @keyframes sun-glow {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.15); }
        }
      `}</style>
    </div>
  );
}
