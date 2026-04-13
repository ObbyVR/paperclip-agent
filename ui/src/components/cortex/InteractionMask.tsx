import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "./AgentAvatar";
import { MaskChat, type ChatMessage } from "./MaskChat";
import { MaskDetails } from "./MaskDetails";
import { MaskFiles, type MaskFile } from "./MaskFiles";
import type { CortexStatus } from "@/lib/cortex-status";

type MaskTab = "chat" | "details" | "files";

export interface MaskData {
  issueId?: string;
  issueIdentifier?: string;
  issueTitle?: string;
  issueDescription?: string;
  issueStatus?: string;
  agentId: string;
  agentName: string;
  agentRole?: string;
  agentStatus: CortexStatus;
  projectName?: string;
  modelTag?: string;
  costTag?: string;
  requestMessage?: string;
  messages: ChatMessage[];
  unlockExplanation?: string;
  subTasks?: Array<{ label: string; status: "done" | "active" | "pending" }>;
  metrics?: Array<{ label: string; value: string }>;
  files: MaskFile[];
}

interface InteractionMaskProps {
  open: boolean;
  data: MaskData | null;
  chatLoading?: boolean;
  onClose: () => void;
  onApprove?: () => void;
  onRevise?: () => void;
  onReject?: () => void;
  onSendMessage?: (text: string) => void;
}

export function InteractionMask({ open, data, chatLoading, onClose, onApprove, onRevise, onReject, onSendMessage }: InteractionMaskProps) {
  const [tab, setTab] = useState<MaskTab>("chat");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Reset tab + input when switching to a different issue
  useEffect(() => {
    setTab("chat");
    setInput("");
    setSending(false);
  }, [data?.issueId]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!data) return null;

  const showActions = data.agentStatus === "needs-me";

  const doSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await onSendMessage?.(input.trim());
      setInput("");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="absolute inset-0 z-20 bg-black/20" onClick={onClose} />
      )}
      <div className={cn(
        "absolute inset-y-0 right-0 z-30 flex w-[460px] flex-col border-l border-white/[0.06] bg-[#10131d] shadow-[-12px_0_48px_rgba(0,0,0,0.5)] transition-transform duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        open ? "translate-x-0" : "translate-x-full",
      )}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <AgentAvatar name={data.agentName} status={data.agentStatus} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">{data.agentName}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-white/45">
            {data.projectName && <span>{data.projectName}</span>}
            {data.issueIdentifier && <span className="font-mono text-[10px] text-white/35">{data.issueIdentifier}</span>}
          </div>
        </div>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-white/45 transition-all hover:bg-white/[0.06] hover:text-white">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Request banner */}
      {data.requestMessage && (
        <div className="flex items-center gap-2.5 border-b border-[rgba(252,211,77,0.08)] bg-[rgba(252,211,77,0.08)] px-5 py-2.5 text-[13px] font-medium text-[#fcd34d]">
          <span className="shrink-0">✋</span>{data.requestMessage}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-white/[0.06] px-5">
        {(["chat", "details", "files"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn(
            "mr-5 border-b-2 border-transparent py-2.5 text-[12px] font-medium text-white/45 transition-all hover:text-white/55",
            tab === t && "border-b-indigo-400 text-white",
          )}>
            {t === "chat" ? "Chat" : t === "details" ? "Dettagli" : "File"}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "chat" && <MaskChat messages={data.messages} isLoading={chatLoading} />}
      {tab === "details" && <MaskDetails issueTitle={data.issueTitle} issueIdentifier={data.issueIdentifier} issueDescription={data.issueDescription} issueStatus={data.issueStatus} agentStatus={data.agentStatus} unlockExplanation={data.unlockExplanation} subTasks={data.subTasks} metrics={data.metrics} />}
      {tab === "files" && <MaskFiles files={data.files} />}

      {/* Actions */}
      {showActions && (
        <div className="flex gap-2 border-t border-white/[0.06] px-5 py-3.5">
          <button onClick={onApprove} className="flex-1 rounded-lg bg-[#6ee7b7] py-2.5 text-center text-[13px] font-semibold text-[#0b0d15] transition-all hover:brightness-110">Approva</button>
          <button onClick={onRevise} className="flex-1 rounded-lg border border-[rgba(252,211,77,0.15)] bg-[rgba(252,211,77,0.08)] py-2.5 text-center text-[13px] font-semibold text-[#fcd34d] transition-all hover:bg-[rgba(252,211,77,0.14)]">Revisione</button>
          <button onClick={onReject} className="flex-1 rounded-lg border border-[rgba(252,165,165,0.15)] bg-[rgba(252,165,165,0.08)] py-2.5 text-center text-[13px] font-semibold text-[#fca5a5] transition-all hover:bg-[rgba(252,165,165,0.14)]">Rifiuta</button>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 border-t border-white/[0.06] px-5 py-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doSend(); }} placeholder={`Scrivi a ${data.agentName}...`} className="flex-1 rounded-lg border border-white/[0.06] bg-[#161a27] px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-white/45 focus:border-indigo-400" disabled={sending} />
        <button onClick={doSend} disabled={sending || !input.trim()} className={cn("rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-all", sending ? "opacity-50 cursor-wait" : "hover:brightness-[1.15]")}>{sending ? "..." : "Invia"}</button>
      </div>
    </div>
    </>
  );
}
