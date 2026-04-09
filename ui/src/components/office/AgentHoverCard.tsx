/**
 * AgentHoverCard — Rich tooltip popup on agent hover.
 *
 * Shows portrait canvas, full name, role, status, current issue,
 * and last activity snippet. Appears after 400ms hover delay.
 */
import { useState, useRef, useCallback, type ReactNode } from "react";
import { PixelAgent } from "./PixelAgent";
import type { Agent, Approval, ActivityEvent } from "@paperclipai/shared";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Attivo", color: "#22c55e" },
  running: { label: "In esecuzione", color: "#06b6d4" },
  idle: { label: "Inattivo", color: "#6b7280" },
  paused: { label: "In pausa", color: "#f59e0b" },
  error: { label: "Errore", color: "#ef4444" },
  terminated: { label: "Terminato", color: "#374151" },
};

interface AgentHoverCardProps {
  agent: Agent;
  pending?: Approval[];
  lastComment?: ActivityEvent;
  isLeader?: boolean;
  children: ReactNode;
}

export function AgentHoverCard({ agent, pending, lastComment, isLeader, children }: AgentHoverCardProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), 400);
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
  }, []);

  // Touch: long-press (500ms) to toggle card
  const handleTouchStart = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible((v) => !v), 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const roleName = agent.name.split("—")[1]?.trim() ?? agent.role ?? "";
  const fullName = agent.name.split("—")[0]?.trim() ?? agent.name;
  const statusInfo = STATUS_LABELS[agent.status] ?? STATUS_LABELS.idle;

  const hasPending = pending && pending.length > 0;
  let currentTask: string | null = null;
  if (hasPending) {
    currentTask = (pending![0].payload as Record<string, unknown> | null)?.stepTitle as string ??
      pending![0].type.replaceAll("_", " ");
  }

  let lastActivity: string | null = null;
  if (lastComment) {
    const snippet = (lastComment.details as Record<string, unknown> | null)?.bodySnippet as string;
    if (snippet) lastActivity = snippet.length > 60 ? snippet.slice(0, 57) + "..." : snippet;
  }

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {children}

      {visible && (
        <div
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg border border-slate-700/80 bg-slate-900/95 backdrop-blur-sm shadow-xl p-3 pointer-events-none"
          style={{ animation: "hover-card-in 150ms ease-out" }}
        >
          {/* Header: portrait + name */}
          <div className="flex items-center gap-2.5 mb-2">
            <div className="rounded-md overflow-hidden border border-slate-700/50" style={{ width: 40, height: 44 }}>
              <PixelAgent agentId={agent.id} status={agent.status} scale={0.85} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                {isLeader && <span className="text-[9px]">👑</span>}
                <span className="text-[11px] font-semibold text-white truncate">{fullName}</span>
              </div>
              <span className="text-[9px] text-slate-400 block truncate">{roleName}</span>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusInfo.color }} />
            <span className="text-[10px] font-medium" style={{ color: statusInfo.color }}>{statusInfo.label}</span>
          </div>

          {/* Current task */}
          {currentTask && (
            <div className="mb-1.5 px-2 py-1 rounded bg-red-950/60 border border-red-500/30">
              <span className="text-[8px] uppercase tracking-wider text-red-400 font-bold">In attesa</span>
              <p className="text-[9px] text-red-200 truncate mt-0.5">{currentTask}</p>
            </div>
          )}

          {/* Last activity */}
          {lastActivity && !currentTask && (
            <div className="px-2 py-1 rounded bg-slate-800/60 border border-slate-700/30">
              <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">Ultimo messaggio</span>
              <p className="text-[9px] text-slate-300 mt-0.5 line-clamp-2">{lastActivity}</p>
            </div>
          )}

          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-700/80" />

          <style>{`
            @keyframes hover-card-in {
              from { opacity: 0; transform: translate(-50%, 4px); }
              to { opacity: 1; transform: translate(-50%, 0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
