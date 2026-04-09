import { useNavigate } from "@/lib/router";
import { Bell, AlertCircle, Info, CheckCheck, X } from "lucide-react";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, type Notification } from "../api/notifications";
import { queryKeys } from "../lib/queryKeys";

interface BellItem {
  label: string;
  count: number;
  path: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-600/90 text-white",
  high: "bg-orange-600/90 text-white",
  medium: "bg-amber-600/90 text-white",
  info: "bg-blue-600/90 text-white",
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  info: "bg-blue-500",
};

export function NotificationBell() {
  const { selectedCompanyId } = useCompany();
  const badge = useInboxBadge(selectedCompanyId);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // Persistent notifications
  const { data: recentNotifications } = useQuery({
    queryKey: queryKeys.notifications.list(selectedCompanyId!),
    queryFn: () => notificationsApi.list(selectedCompanyId!, { limit: 10 }),
    enabled: !!selectedCompanyId,
    refetchInterval: 30000,
  });

  const { data: notifCounts } = useQuery({
    queryKey: queryKeys.notifications.count(selectedCompanyId!),
    queryFn: () => notificationsApi.count(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      notificationsApi.markRead(selectedCompanyId!, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(selectedCompanyId!) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.count(selectedCompanyId!) });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(selectedCompanyId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(selectedCompanyId!) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.count(selectedCompanyId!) });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      notificationsApi.dismiss(selectedCompanyId!, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(selectedCompanyId!) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.count(selectedCompanyId!) });
    },
  });

  // Combine legacy badge total with persistent notification count
  const persistentCount = notifCounts?.total ?? 0;
  const legacyTotal = badge.inbox;
  const total = Math.max(legacyTotal, persistentCount);

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
  const hasCritical = (notifCounts?.critical ?? 0) > 0;

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

  const renderNotification = (notif: Notification) => {
    const timeAgo = getTimeAgo(notif.createdAt);
    return (
      <div
        key={notif.id}
        className="group flex items-start gap-2 px-4 py-2.5 transition-colors hover:bg-accent/50"
      >
        <div className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[notif.severity] ?? SEVERITY_DOT.info)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-tight truncate">{notif.title}</p>
          {notif.body && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{notif.body}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo}
            {notif.escalationCount > 0 && (
              <span className="ml-1 text-red-400">
                (escalation #{notif.escalationCount})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-0.5 rounded hover:bg-accent"
            title="Segna come letta"
            onClick={(e) => { e.stopPropagation(); markReadMutation.mutate({ id: notif.id }); }}
          >
            <CheckCheck className="h-3 w-3 text-muted-foreground" />
          </button>
          <button
            className="p-0.5 rounded hover:bg-accent"
            title="Ignora"
            onClick={(e) => { e.stopPropagation(); dismissMutation.mutate({ id: notif.id }); }}
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative shrink-0">
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span className={cn(
              "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow-[0_0_0_2px_hsl(var(--background))]",
              hasCritical || actionCount > 0 ? "bg-red-600" : "bg-amber-600",
            )}>
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 max-h-[420px] overflow-y-auto">
        {actionItems.length === 0 && infoItems.length === 0 && (!recentNotifications || recentNotifications.length === 0) ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nessuna notifica
          </div>
        ) : (
          <>
            {/* ── Action required section (legacy badges) ── */}
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

            {/* ── Info / alerts section (legacy badges) ── */}
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

            {/* ── Persistent notifications ── */}
            {recentNotifications && recentNotifications.length > 0 && (
              <div className={(actionItems.length > 0 || infoItems.length > 0) ? "border-t border-border/50" : ""}>
                <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-1.5">
                  <Bell className="h-3.5 w-3.5 text-violet-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-400">
                    Recenti
                  </span>
                  {persistentCount > 0 && (
                    <button
                      className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => markAllReadMutation.mutate()}
                    >
                      Segna tutte lette
                    </button>
                  )}
                </div>
                {recentNotifications.map(renderNotification)}
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

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ora";
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  return `${days}g fa`;
}
