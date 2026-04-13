import { ClipboardList } from "lucide-react";
import { cortexStatusStyles } from "@/lib/cortex-status";
import { STATUS_LABEL } from "@/lib/cortex-utils";
import type { CortexStatus } from "@/lib/cortex-status";
import { cn } from "@/lib/utils";

interface SubTask { label: string; status: "done" | "active" | "pending"; }
interface MaskDetailsProps {
  issueTitle?: string;
  issueIdentifier?: string;
  issueDescription?: string;
  issueStatus?: string;
  agentStatus?: CortexStatus;
  unlockExplanation?: string;
  subTasks?: SubTask[];
  metrics?: Array<{ label: string; value: string }>;
}

export function MaskDetails({ issueTitle, issueIdentifier, issueDescription, issueStatus, agentStatus, unlockExplanation, subTasks, metrics }: MaskDetailsProps) {
  const dot: Record<string, string> = { done: "bg-[#6ee7b7]", active: "bg-[#67e8f9] animate-pulse", pending: "bg-white/45" };

  const statusStyle = agentStatus ? cortexStatusStyles[agentStatus] : null;

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {/* Issue context */}
      {issueTitle && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            {issueIdentifier && (
              <span className="font-mono text-[10px] text-white/35">{issueIdentifier}</span>
            )}
            {issueStatus && statusStyle && (
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium",
                statusStyle.bg, statusStyle.text,
              )}>
                <span className={cn("h-[4px] w-[4px] rounded-full", statusStyle.dot)} />
                {STATUS_LABEL[issueStatus] ?? issueStatus}
              </span>
            )}
          </div>
          <h3 className="text-[14px] font-semibold leading-[1.4] text-white/90">{issueTitle}</h3>
          {issueDescription && (
            <p className="mt-2 text-[12px] leading-[1.6] text-white/50">{issueDescription.length > 300 ? issueDescription.slice(0, 300) + "..." : issueDescription}</p>
          )}
        </div>
      )}

      {unlockExplanation && (
        <div className="mb-4">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Cosa sblocca la tua approvazione</h4>
          <div className="rounded-lg border-l-2 border-indigo-400 bg-[#161a27] px-3.5 py-2.5 text-[13px] leading-[1.6] text-white/65">{unlockExplanation}</div>
        </div>
      )}

      {subTasks && subTasks.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Sotto-attivita</h4>
          <ul className="space-y-0">
            {subTasks.map((st, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5 text-[12px] text-white/65">
                <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${dot[st.status]}`} />
                {st.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {metrics && metrics.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Metriche</h4>
          {metrics.map((m, i) => (
            <div key={i} className="flex justify-between border-b border-white/[0.06] py-[7px] text-[12.5px] last:border-none">
              <span className="text-white/45">{m.label}</span>
              <span className="font-medium text-white/65 font-mono text-[11.5px]">{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state only if nothing at all */}
      {!issueTitle && !unlockExplanation && (!subTasks || subTasks.length === 0) && (!metrics || metrics.length === 0) && (
        <div className="flex flex-col items-center justify-center gap-2 pt-16 text-white/35">
          <ClipboardList className="h-8 w-8 text-white/15" />
          <span className="text-[12px]">Nessun dettaglio disponibile</span>
        </div>
      )}
    </div>
  );
}
