/**
 * DeskUnit — A single agent workstation rendered with HTML/CSS + sprite images.
 *
 * Composites: chair sprite, PixelAgent canvas, desk sprite, monitor, keyboard,
 * random accessory, name tag, and optional speech bubble.
 */
import type { Agent, Approval, ActivityEvent } from "@paperclipai/shared";
import { PixelAgent } from "./PixelAgent";

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e", running: "#06b6d4", idle: "#6b7280",
  paused: "#f59e0b", error: "#ef4444", terminated: "#374151",
};

/** Short synth pop sound — no audio file needed */
function playClickPop() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
    setTimeout(() => ctx.close(), 200);
  } catch { /* silent fail if audio blocked */ }
}

const DESK_ITEMS = ["lamp", "mug", "eightBall", "stapler", "penHolder", "thermos", "duck"];
const ITEM_SPRITES: Record<string, string> = {
  lamp: "/sprites/office/desk-lamp.png",
  mug: "/sprites/office/coffee-mug.png",
  eightBall: "/sprites/office/magic-8-ball.png",
  stapler: "/sprites/office/stapler.png",
  penHolder: "/sprites/office/pen-holder.png",
  thermos: "/sprites/office/thermos.png",
  duck: "/sprites/office/rubber-duck.png",
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface DeskUnitProps {
  agent: Agent;
  pending?: Approval[];
  lastComment?: ActivityEvent;
  onClick: () => void;
  variant?: "normal" | "ceo";
  isLeader?: boolean;
}

export function DeskUnit({ agent, pending, lastComment, onClick, variant = "normal", isLeader }: DeskUnitProps) {
  const agentHash = hash(agent.id);
  const accessoryKey = DESK_ITEMS[agentHash % DESK_ITEMS.length];
  const accessorySrc = ITEM_SPRITES[accessoryKey];
  const dotColor = STATUS_COLORS[agent.status] ?? STATUS_COLORS.idle;
  const firstName = agent.name.split("—")[0]?.trim().split(" ")[0] ?? "";
  const isCeo = variant === "ceo";

  // Speech bubble content
  const hasPending = pending && pending.length > 0;
  let bubbleText: string | null = null;
  let bubbleUrgent = false;
  if (hasPending) {
    const text = (pending![0].payload as Record<string, unknown> | null)?.stepTitle as string ??
      pending![0].type.replaceAll("_", " ");
    bubbleText = text.length > 30 ? text.slice(0, 27) + "..." : text;
    bubbleUrgent = true;
  } else if (lastComment) {
    const text = (lastComment.details as Record<string, unknown> | null)?.bodySnippet as string;
    if (text) {
      bubbleText = text.length > 30 ? text.slice(0, 27) + "..." : text;
    }
  }

  const deskW = isCeo ? 170 : 130;
  const roleName = agent.name.split("—")[1]?.trim() ?? agent.role ?? "";
  const tooltipText = `${agent.name}\n${roleName} · ${agent.status}`;

  // Monitor glow color based on status — visible on light background
  const monitorGlow: Record<string, string> = {
    active: "rgba(34,197,94,0.55)", running: "rgba(6,182,212,0.55)",
    idle: "rgba(80,120,220,0.35)", paused: "rgba(245,158,11,0.35)",
    error: "rgba(239,68,68,0.55)", terminated: "rgba(30,30,40,0.5)",
  };
  const glowColor = monitorGlow[agent.status] ?? monitorGlow.idle;
  const isActive = agent.status === "active" || agent.status === "running";

  // Dynamic sub-label — show last activity when available
  let subLabel = "";
  let subLabelColor = "text-slate-600";
  const lastSnippet = lastComment
    ? ((lastComment.details as Record<string, unknown> | null)?.bodySnippet as string) ?? null
    : null;

  if (agent.status === "active" || agent.status === "running") {
    subLabel = hasPending ? "In attesa review" : "Al lavoro...";
    subLabelColor = "text-green-500/70";
  } else if (agent.status === "error") {
    subLabel = "Errore!";
    subLabelColor = "text-red-400/80";
  } else if (agent.status === "paused") {
    subLabel = "In pausa";
    subLabelColor = "text-amber-400/60";
  } else if (lastSnippet) {
    // Show truncated last activity instead of generic "Disponibile"
    subLabel = lastSnippet.length > 28 ? lastSnippet.slice(0, 25) + "..." : lastSnippet;
    subLabelColor = "text-slate-700/70";
  } else {
    subLabel = "Disponibile";
    subLabelColor = "text-slate-600/80";
  }

  return (
    <button
      type="button"
      onClick={() => { playClickPop(); onClick(); }}
      title={tooltipText}
      className="relative flex flex-col items-center cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded-lg transition-transform duration-200 hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.98]"
      style={{ width: deskW + 20 }}
    >
      {/* Urgent badge — only for pending approvals (small, non-intrusive) */}
      {hasPending && (
        <div className="absolute -top-1 right-0 z-10 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center border-2 border-white shadow-md">
          <span className="text-[8px] font-bold text-white">{pending!.length}</span>
        </div>
      )}

      {/* Desk composition — layered: chair → agent → desk → monitor/items */}
      <div className="relative group-hover:brightness-110 transition-all" style={{ width: deskW, height: 160 }}>
        {/* Hover glow */}
        <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity"
          style={{ boxShadow: `0 0 20px ${dotColor}20` }}
        />

        {/* Chair (behind agent) */}
        <img src="/sprites/office/chair.png" alt="" className="absolute pointer-events-none"
          style={{ left: deskW / 2 - 24, top: 4, width: 48, height: 72, imageRendering: "pixelated" }} draggable={false} />

        {/* Pixel agent — hidden when paused (agent is in break area) */}
        {agent.status !== "paused" ? (
          <div className="absolute z-10" style={{ left: deskW / 2 - 36, top: -10 }}>
            <PixelAgent agentId={agent.id} status={agent.status} />
          </div>
        ) : (
          <div className="absolute z-10 flex items-center justify-center" style={{ left: deskW / 2 - 20, top: 8, width: 40, height: 40 }}>
            <span className="text-[18px] opacity-40" style={{ animation: "away-bob 3s ease-in-out infinite" }}>☕</span>
          </div>
        )}

        {/* Desk surface (covers agent legs, z-20 in front of agent torso bottom) */}
        <img src="/sprites/office/desk.png" alt="" className="absolute z-20 pointer-events-none"
          style={{ left: isCeo ? -5 : 0, top: 64, width: deskW, height: 76, imageRendering: "pixelated" }} draggable={false} />

        {/* Monitor(s) — z-30 on top of desk */}
        {isCeo ? (
          <>
            <img src="/sprites/office/monitor_back.png" alt="" className="absolute z-30 pointer-events-none"
              style={{ left: deskW / 2 - 52, top: 40, width: 34, height: 28, imageRendering: "pixelated" }} draggable={false} />
            <img src="/sprites/office/monitor_back.png" alt="" className="absolute z-30 pointer-events-none"
              style={{ left: deskW / 2 - 14, top: 37, width: 28, height: 30, imageRendering: "pixelated" }} draggable={false} />
            <img src="/sprites/office/monitor_back.png" alt="" className="absolute z-30 pointer-events-none"
              style={{ left: deskW / 2 + 18, top: 40, width: 34, height: 28, imageRendering: "pixelated" }} draggable={false} />
          </>
        ) : (
          <img src="/sprites/office/monitor_back.png" alt="" className="absolute z-30 pointer-events-none"
            style={{ left: deskW / 2 - 20, top: 38, width: 40, height: 34, imageRendering: "pixelated" }} draggable={false} />
        )}

        {/* Monitor screen glow — z-40 overlay on monitor */}
        {isCeo ? (
          /* CEO: glow on all 3 monitors */
          <>
            {[{ l: deskW / 2 - 48, t: 44, w: 26, h: 16 }, { l: deskW / 2 - 10, t: 41, w: 20, h: 18 }, { l: deskW / 2 + 22, t: 44, w: 26, h: 16 }].map((m, i) => (
              <div key={i} className="absolute z-40 pointer-events-none rounded-sm"
                style={{
                  left: m.l, top: m.t, width: m.w, height: m.h,
                  backgroundColor: glowColor,
                  boxShadow: isActive ? `0 0 6px ${glowColor}` : undefined,
                  animation: isActive ? "monitor-pulse 2s ease-in-out infinite" : agent.status === "error" ? "monitor-blink 1s ease-in-out infinite" : undefined,
                  transition: "background-color 0.5s",
                }}
              />
            ))}
          </>
        ) : (
          <div className="absolute z-40 pointer-events-none rounded-sm"
            style={{
              left: deskW / 2 - 16, top: 42, width: 32, height: 20,
              backgroundColor: glowColor,
              boxShadow: isActive ? `0 0 8px ${glowColor}, 0 -4px 12px ${glowColor}` : agent.status === "error" ? `0 0 6px rgba(239,68,68,0.3)` : undefined,
              animation: agent.status === "error" ? "monitor-blink 1s ease-in-out infinite" : isActive ? "monitor-pulse 2s ease-in-out infinite" : undefined,
              transition: "background-color 0.5s",
            }}
          />
        )}

        {/* Keyboard — z-30 on desk */}
        <img src="/sprites/office/keyboard_back.png" alt="" className="absolute z-30 pointer-events-none"
          style={{ left: deskW / 2 - 20, top: 74, width: 40, height: 11, imageRendering: "pixelated" }} draggable={false} />

        {/* Accessory — z-30 on desk */}
        {accessorySrc && (
          <img src={accessorySrc} alt="" className="absolute z-30 pointer-events-none"
            style={{ right: isCeo ? 8 : 2, top: 68, width: 18, height: 18, imageRendering: "pixelated" }} draggable={false} />
        )}

        {/* CEO extras: phone + mug — z-30 on desk */}
        {isCeo && (
          <>
            <img src="/sprites/office/phone.png" alt="" className="absolute z-30 pointer-events-none"
              style={{ left: 4, top: 70, width: 20, height: 20, imageRendering: "pixelated" }} draggable={false} />
            <img src="/sprites/office/coffee-mug.png" alt="" className="absolute z-30 pointer-events-none"
              style={{ right: 28, top: 70, width: 16, height: 16, imageRendering: "pixelated" }} draggable={false} />
          </>
        )}
      </div>

      {/* Name tag */}
      <div className="flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded bg-white/95 border border-slate-300 shadow-sm group-hover:border-violet-500/60 group-hover:bg-white group-focus-visible:border-violet-500/60 transition-colors">
        {isLeader && <span className="text-[9px] shrink-0" title="Team Lead">👑</span>}
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
        <span className="text-[10px] font-semibold text-slate-800 truncate max-w-[80px]">{firstName}</span>
      </div>
      {isLeader && !isCeo && (
        <span className="text-[7px] text-amber-600/80 font-bold uppercase tracking-wider mt-px">Team Lead</span>
      )}

      {/* Sub-label: dynamic status text */}
      <span className={`text-[8px] mt-0.5 ${subLabelColor} truncate max-w-[100px]`}>{subLabel}</span>

      {/* CEO nameplate */}
      {isCeo && (
        <div className="mt-0.5 px-3 py-0.5 rounded border bg-amber-950/20 border-amber-600/40">
          <span className="text-[9px] font-bold text-amber-400">
            ★ CEO — {firstName}
          </span>
        </div>
      )}

      {/* Monitor animations */}
      <style>{`
        @keyframes monitor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes monitor-pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
        @keyframes away-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
    </button>
  );
}
