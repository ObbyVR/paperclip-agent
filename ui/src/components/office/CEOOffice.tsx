/**
 * CEOOffice — Special executive office card with triple desk,
 * gold decorations, and approval queue.
 */
import type { Agent, Approval, ActivityEvent } from "@paperclipai/shared";
import { DeskUnit } from "./DeskUnit";
import { PixelAgent } from "./PixelAgent";

interface QueueAgent {
  agent: Agent;
  text: string;
  count: number;
}

interface CEOOfficeProps {
  ceo: Agent;
  approvalQueue: QueueAgent[];
  pendingApprovals: Map<string, Approval[]>;
  lastComments: Map<string, ActivityEvent>;
  onAgentClick: (agent: Agent) => void;
}

export function CEOOffice({ ceo, approvalQueue, pendingApprovals, lastComments, onAgentClick }: CEOOfficeProps) {
  const ceoFirstName = ceo.name.split("—")[0]?.trim().split(" ")[0] ?? "";

  return (
    <div className="rounded-lg border border-violet-500/30 overflow-hidden" style={{ backgroundColor: "rgba(100,70,200,0.04)" }}>
      {/* Header */}
      <div className="flex items-center justify-center px-4 py-2" style={{ backgroundColor: "rgba(167,139,250,0.12)" }}>
        <span className="text-xs font-bold tracking-wide text-violet-400">
          ★ UFFICIO DEL CEO
        </span>
      </div>

      {/* CEO desk area */}
      <div className="flex flex-col items-center py-4 relative">
        {/* Skyline window — centered behind desk */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-48 h-16 rounded border border-slate-600/30 overflow-hidden"
          style={{ background: "linear-gradient(180deg, #0a0e1a 0%, #121830 60%, #1a2040 100%)" }}>
          {/* Buildings silhouette — window pattern seeded by building index */}
          <div className="absolute bottom-0 w-full flex items-end justify-center gap-[2px] px-2">
            {[20, 28, 16, 32, 24, 18, 30, 14, 26, 22, 34, 20, 28].map((h, i) => (
              <div key={i} className="bg-slate-800/80" style={{ width: 6 + (i % 3) * 2, height: h, borderRadius: "1px 1px 0 0" }}>
                {/* Windows — deterministic pattern based on building+floor index */}
                {Array.from({ length: Math.floor(h / 6) }).map((_, j) => {
                  const lit = ((i * 7 + j * 13 + 3) % 5) > 1; // deterministic pseudo-random
                  return (
                    <div key={j} className="mx-auto mt-1" style={{
                      width: 2, height: 2, borderRadius: 1,
                      backgroundColor: lit ? "rgba(255,220,120,0.4)" : "transparent",
                    }} />
                  );
                })}
              </div>
            ))}
          </div>
          {/* Stars */}
          {[{ x: 10, y: 4 }, { x: 80, y: 8 }, { x: 140, y: 3 }, { x: 50, y: 6 }, { x: 120, y: 10 }].map((s, i) => (
            <div key={i} className="absolute w-[2px] h-[2px] rounded-full bg-white/40" style={{ left: s.x, top: s.y }} />
          ))}
        </div>

        {/* Award frames on sides */}
        <div className="absolute top-4 left-3 flex flex-col gap-1.5">
          {[0, 1].map((i) => (
            <div key={i} className="w-8 h-10 rounded-sm border border-amber-600/40 flex items-center justify-center"
              style={{ backgroundColor: "rgba(201,169,76,0.06)" }}>
              <span className="text-[8px] text-amber-600/40">★</span>
            </div>
          ))}
        </div>
        <div className="absolute top-4 right-3 flex flex-col gap-1.5">
          {[0, 1].map((i) => (
            <div key={i} className="w-8 h-10 rounded-sm border border-amber-600/40 flex items-center justify-center"
              style={{ backgroundColor: "rgba(201,169,76,0.06)" }}>
              <span className="text-[8px] text-amber-600/40">★</span>
            </div>
          ))}
        </div>

        {/* Plants on sides */}
        <img src="/sprites/office/plant.png" alt="" className="absolute left-3 bottom-4 pointer-events-none"
          style={{ width: 40, height: 54, imageRendering: "pixelated" }} draggable={false} />
        <img src="/sprites/office/plant.png" alt="" className="absolute right-3 bottom-4 pointer-events-none"
          style={{ width: 40, height: 54, imageRendering: "pixelated" }} draggable={false} />

        {/* CEO Desk */}
        <DeskUnit
          agent={ceo}
          pending={pendingApprovals.get(ceo.id)}
          lastComment={lastComments.get(ceo.id)}
          onClick={() => onAgentClick(ceo)}
          variant="ceo"
        />
      </div>

      {/* Approval queue */}
      {approvalQueue.length > 0 && (
        <div className="border-t border-violet-500/15 px-4 py-3">
          {/* Divider label */}
          <div className="text-center mb-3">
            <span className="text-[9px] uppercase tracking-widest text-white/15 font-bold">
              In attesa di approvazione
            </span>
          </div>

          {/* Queue agents */}
          <div className="flex flex-wrap justify-center gap-4">
            {approvalQueue.map((qa) => {
              const label = qa.count > 1 ? `${qa.text} (+${qa.count - 1})` : qa.text;
              const firstName = qa.agent.name.split("—")[0]?.trim().split(" ")[0] ?? "";
              return (
                <button
                  key={qa.agent.id}
                  type="button"
                  onClick={() => onAgentClick(qa.agent)}
                  className="flex flex-col items-center gap-1 cursor-pointer group focus:outline-none"
                >
                  {/* Bubble */}
                  <div className="px-2 py-0.5 rounded bg-red-950/90 border border-red-500/60 text-[9px] text-red-200 truncate max-w-[120px]">
                    {label}
                  </div>
                  {/* Agent */}
                  <div className="group-hover:brightness-110 transition-all">
                    <PixelAgent agentId={qa.agent.id} status={qa.agent.status} />
                  </div>
                  {/* Name */}
                  <span className="text-[9px] text-slate-400 font-medium">{firstName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
