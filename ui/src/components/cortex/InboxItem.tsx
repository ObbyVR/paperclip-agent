import { cn } from "@/lib/utils";
import { AgentAvatar } from "./AgentAvatar";
import type { CortexStatus } from "@/lib/cortex-status";

interface InboxItemProps {
  agentName: string;
  agentStatus: CortexStatus;
  title: string;
  subtitle: string;
  time: string;
  action?: { label: string; variant: "go" | "look" };
  onClick?: () => void;
}

export function InboxItem({ agentName, agentStatus, title, subtitle, time, action, onClick }: InboxItemProps) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border border-white/[0.06] bg-[#161a27] px-3.5 py-3 text-left transition-all hover:border-white/10 hover:bg-[#1e2233]">
      <AgentAvatar name={agentName} status={agentStatus} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="mt-0.5 truncate text-[11px] text-white/45">{subtitle}</div>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-white/45">{time}</span>
      {action && (
        <span className={cn(
          "shrink-0 rounded-md px-3 py-1 text-[10.5px] font-semibold",
          action.variant === "go" ? "bg-[rgba(110,231,183,0.1)] text-[#6ee7b7]" : "bg-[rgba(252,211,77,0.08)] text-[#fcd34d]",
        )}>{action.label}</span>
      )}
    </button>
  );
}
