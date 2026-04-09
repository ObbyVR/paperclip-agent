import { useNavigate } from "@/lib/router";
import { Bell, AlertCircle, Info } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";

interface BellItem {
  label: string;
  count: number;
  path: string;
}

export function NotificationBell() {
  const { selectedCompanyId } = useCompany();
  const badge = useInboxBadge(selectedCompanyId);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const total = badge.inbox;

  const actionItems: BellItem[] = [
    { label: "Approvazioni", count: badge.approvals, path: "/inbox/all" },
    { label: "Issue non lette", count: badge.mineIssues, path: "/inbox/mine" },
    { label: "Richieste accesso", count: badge.joinRequests, path: "/instance/settings/general" },
  ].filter((i) => i.count > 0);

  const infoItems: BellItem[] = [
    { label: "Run fallite", count: badge.failedRuns, path: "/inbox/all" },
    { label: "Avvisi agenti", count: badge.alerts, path: "/inbox/all" },
  ].filter((i) => i.count > 0);

  const actionCount = actionItems.reduce((s, i) => s + i.count, 0);

  const renderItem = (item: BellItem, badgeClass: string) => (
    <button
      key={item.label}
      className="flex w-full items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-accent/50"
      onClick={() => { navigate(item.path); setOpen(false); }}
    >
      <span>{item.label}</span>
      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", badgeClass)}>
        {item.count}
      </span>
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative shrink-0">
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span className={cn(
              "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow-[0_0_0_2px_hsl(var(--background))]",
              actionCount > 0 ? "bg-red-600" : "bg-amber-600",
            )}>
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        {actionItems.length === 0 && infoItems.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nessuna notifica
          </div>
        ) : (
          <>
            {/* ── Action required section ── */}
            {actionItems.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
                    Azioni richieste
                  </span>
                  <span className="ml-auto rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {actionCount}
                  </span>
                </div>
                {actionItems.map((item) => renderItem(item, "bg-red-600/90 text-white"))}
              </div>
            )}

            {/* ── Info / alerts section ── */}
            {infoItems.length > 0 && (
              <div className={actionItems.length > 0 ? "border-t border-border/50" : ""}>
                <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-1.5">
                  <Info className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                    Avvisi
                  </span>
                </div>
                {infoItems.map((item) => renderItem(item, "bg-amber-600/90 text-white"))}
              </div>
            )}

            {/* ── Footer link ── */}
            <div className="border-t border-border/50">
              <button
                className="flex w-full items-center justify-center px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                onClick={() => { navigate("/inbox/mine"); setOpen(false); }}
              >
                Vai alla Inbox
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
