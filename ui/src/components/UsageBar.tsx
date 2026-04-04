import { useQuery } from "@tanstack/react-query";
import { costsApi } from "../api/costs";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import type { ProviderQuotaResult, QuotaWindow } from "@paperclipai/shared";

function barColor(pct: number): string {
  if (pct >= 80) return "bg-red-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-emerald-500";
}

function barBgColor(pct: number): string {
  if (pct >= 80) return "bg-red-500/20";
  if (pct >= 50) return "bg-amber-500/20";
  return "bg-white/10";
}

function MiniBar({ window: w }: { window: QuotaWindow }) {
  const pct = w.usedPercent ?? 0;
  const resetsIn = w.resetsAt
    ? formatTimeUntil(new Date(w.resetsAt))
    : null;

  return (
    <div className="flex items-center gap-1.5" title={`${w.label}: ${Math.round(pct)}% usato${resetsIn ? ` · reset ${resetsIn}` : ""}${w.valueLabel ? ` · ${w.valueLabel}` : ""}`}>
      <span className="text-[9px] text-muted-foreground w-5 text-right shrink-0">{w.label}</span>
      <div className={cn("h-1.5 w-14 rounded-full overflow-hidden", barBgColor(pct))}>
        <div
          className={cn("h-full rounded-full transition-all", barColor(pct))}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={cn(
        "text-[9px] w-7 shrink-0",
        pct >= 80 ? "text-red-400" : pct >= 50 ? "text-amber-400" : "text-muted-foreground",
      )}>
        {Math.round(pct)}%
      </span>
    </div>
  );
}

function formatTimeUntil(date: Date): string {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "ora";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}g`;
  if (hours > 0) return `${hours}h${minutes > 0 ? `${minutes}m` : ""}`;
  return `${minutes}m`;
}

export function UsageBar() {
  const { selectedCompanyId } = useCompany();

  const { data } = useQuery({
    queryKey: queryKeys.usageQuotaWindows(selectedCompanyId!),
    queryFn: () => costsApi.quotaWindows(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
  });

  if (!data || data.length === 0) return null;

  // Collect all windows from all providers
  const allWindows: QuotaWindow[] = [];
  for (const result of data) {
    if (result.ok && result.windows.length > 0) {
      allWindows.push(...result.windows);
    }
  }

  if (allWindows.length === 0) return null;

  // Show max 3 most relevant windows (prioritize those with usedPercent)
  const sortedWindows = allWindows
    .filter((w) => w.usedPercent !== null)
    .sort((a, b) => (b.usedPercent ?? 0) - (a.usedPercent ?? 0))
    .slice(0, 3);

  if (sortedWindows.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border/50 bg-white/[0.02] px-2 py-1">
      <div className="flex flex-col gap-0.5">
        {sortedWindows.map((w, i) => (
          <MiniBar key={`${w.label}-${i}`} window={w} />
        ))}
      </div>
    </div>
  );
}
