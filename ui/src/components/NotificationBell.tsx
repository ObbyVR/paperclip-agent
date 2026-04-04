import { useNavigate } from "@/lib/router";
import { Bell } from "lucide-react";
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

export function NotificationBell() {
  const { selectedCompanyId } = useCompany();
  const badge = useInboxBadge(selectedCompanyId);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const total = badge.inbox;

  const items = [
    { label: "Issue non lette", count: badge.mineIssues, path: "/inbox/mine" },
    { label: "Approvazioni", count: badge.approvals, path: "/approvals/pending" },
    { label: "Run fallite", count: badge.failedRuns, path: "/inbox/all" },
    { label: "Richieste accesso", count: badge.joinRequests, path: "/settings" },
    { label: "Avvisi agenti", count: badge.alerts, path: "/dashboard" },
  ].filter((i) => i.count > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative shrink-0">
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-[0_0_0_2px_hsl(var(--background))]">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        {items.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nessuna notifica
          </div>
        ) : (
          <div className="py-1">
            {items.map((item) => (
              <button
                key={item.path}
                className="flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-accent/50"
                onClick={() => {
                  navigate(item.path);
                  setOpen(false);
                }}
              >
                <span>{item.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    "bg-red-600/90 text-white",
                  )}
                >
                  {item.count}
                </span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
