import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw, Zap, AlertCircle, CheckCircle2 } from "lucide-react";
import { AgentAvatar } from "./AgentAvatar";
import { issueToV2Status } from "@/lib/cortex-status";
import type { CortexStatus } from "@/lib/cortex-status";

interface ActivityItem {
  id: string;
  type: "status" | "running" | "blocked" | "done";
  title: string;
  agentName?: string;
  identifier?: string;
  time: string;
  status: CortexStatus;
}

interface ActivityFeedProps {
  items: ActivityItem[];
  onItemClick?: (issueId: string) => void;
  className?: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  status: <RefreshCw className="h-3.5 w-3.5 text-white/40" />,
  running: <Zap className="h-3.5 w-3.5 text-[#67e8f9]" />,
  blocked: <AlertCircle className="h-3.5 w-3.5 text-[#fcd34d]" />,
  done: <CheckCircle2 className="h-3.5 w-3.5 text-[#6ee7b7]" />,
};

const TYPE_LABEL: Record<string, string> = {
  running: "in esecuzione",
  blocked: "richiede azione",
  done: "completato",
  status: "aggiornato",
};

export function ActivityFeed({ items, onItemClick, className }: ActivityFeedProps) {
  if (items.length === 0) return null;

  return (
    <div className={cn("border-t border-white/[0.04] bg-[#0b0d15]/50", className)}>
      <div className="flex items-center justify-between px-4 py-2 md:px-7">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/25">Attività recente</h3>
        <span className="text-[10px] text-white/20">{items.length} eventi</span>
      </div>
      <div className="max-h-[180px] overflow-y-auto px-4 pb-3 md:px-7">
        <div className="space-y-0.5">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => onItemClick?.(item.id)}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">{TYPE_ICON[item.type]}</span>
              <div className="min-w-0 flex-1">
                <span className="truncate text-[11px] text-white/60">{item.title}</span>
                <span className="ml-1.5 text-[10px] text-white/30">{TYPE_LABEL[item.type]}</span>
              </div>
              {item.agentName && (
                <span className="hidden text-[10px] text-white/30 sm:block">{item.agentName}</span>
              )}
              <span className="shrink-0 text-[9px] text-white/20">{item.time}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Build activity items from issues + liveRuns data */
export function buildActivityItems(
  issues: Array<{ id: string; title: string; status: string; identifier?: string | null; updatedAt: string | Date; assigneeAgentId?: string | null; isUnreadForMe?: boolean }>,
  agentMap: Map<string, string>,
  liveRunIssueIds: Set<string>,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const issue of issues) {
    const status = issueToV2Status(issue.status, {
      isUnread: issue.isUnreadForMe,
      hasLiveRun: liveRunIssueIds.has(issue.id),
    });

    let type: ActivityItem["type"] = "status";
    if (liveRunIssueIds.has(issue.id)) type = "running";
    else if (status === "needs-me") type = "blocked";
    else if (status === "done") type = "done";

    // Only show active/interesting items
    if (status === "idle") continue;

    const d = new Date(issue.updatedAt);
    const time = d.toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit" });
    const agentName = issue.assigneeAgentId ? agentMap.get(issue.assigneeAgentId) : undefined;

    items.push({
      id: issue.id,
      type,
      title: issue.title,
      agentName,
      identifier: issue.identifier ?? undefined,
      time,
      status,
    });
  }

  // Sort by most recent first
  return items
    .sort((a, b) => {
      const order = { blocked: 0, running: 1, status: 2, done: 3 };
      return (order[a.type] ?? 9) - (order[b.type] ?? 9);
    })
    .slice(0, 15);
}
