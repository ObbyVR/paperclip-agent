import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation, Link } from "@/lib/router";
import { activityApi } from "../api/activity";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { PageTabBar } from "../components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import {
  History,
  ChevronRight,
  FileText,
  Bot,
  Zap,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import type { Agent, ActivityEvent, Issue } from "@paperclipai/shared";

type ActivityTab = "recenti" | "in_corso" | "completate";
const VALID_TABS: ActivityTab[] = ["recenti", "in_corso", "completate"];

/* ── Status-aware card styling (matches Approvals page) ── */

function cardStyle(status: string | null, hasFailed?: boolean) {
  if (hasFailed) return {
    border: "border-red-500/20",
    bg: "bg-red-500/[0.03]",
    tabBorder: "border-red-500/10",
    tabHover: "hover:bg-red-500/5",
    tabActive: "text-red-400 bg-red-500/[0.06]",
  };
  switch (status) {
    case "blocked":
      return {
        border: "border-amber-500/20",
        bg: "bg-amber-500/[0.03]",
        tabBorder: "border-amber-500/10",
        tabHover: "hover:bg-amber-500/5",
        tabActive: "text-amber-400 bg-amber-500/[0.06]",
      };
    case "in_progress":
      return {
        border: "border-cyan-500/20",
        bg: "bg-cyan-500/[0.03]",
        tabBorder: "border-cyan-500/10",
        tabHover: "hover:bg-cyan-500/5",
        tabActive: "text-cyan-400 bg-cyan-500/[0.06]",
      };
    case "done":
      return {
        border: "border-emerald-500/20",
        bg: "bg-emerald-500/[0.03]",
        tabBorder: "border-emerald-500/10",
        tabHover: "hover:bg-emerald-500/5",
        tabActive: "text-emerald-400 bg-emerald-500/[0.06]",
      };
    case "cancelled":
      return {
        border: "border-border/50",
        bg: "bg-card/30",
        tabBorder: "border-border/30",
        tabHover: "hover:bg-white/5",
        tabActive: "text-muted-foreground bg-white/5",
      };
    default:
      return {
        border: "border-border/50",
        bg: "bg-card/50",
        tabBorder: "border-border/30",
        tabHover: "hover:bg-white/5",
        tabActive: "text-cyan-400 bg-cyan-500/[0.06]",
      };
  }
}

/* ── Accordion tab button (matches Approvals style) ── */

type AccordionSection = "dettagli" | "timeline" | null;

function AccordionTabButton({
  label,
  isOpen,
  onClick,
  style: s,
}: {
  label: string;
  isOpen: boolean;
  onClick: () => void;
  style: ReturnType<typeof cardStyle>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 py-2 text-xs font-medium text-center transition-colors",
        s.tabHover,
        "border-r last:border-r-0",
        s.tabBorder,
        isOpen ? s.tabActive : "text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

/* ── Status icon (matches Approvals) ── */

function statusIcon(status: string | null, hasFailed?: boolean) {
  if (hasFailed) return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
  if (status === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === "in_progress") return <Zap className="h-3.5 w-3.5 text-cyan-400" />;
  if (status === "blocked") return <AlertCircle className="h-3.5 w-3.5 text-amber-500 animate-pulse" />;
  if (status === "cancelled") return <XCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

const STATUS_LABELS: Record<string, string> = {
  done: "Completata",
  blocked: "Da approvare",
  in_progress: "In corso",
  cancelled: "Annullata",
  todo: "Da fare",
  in_review: "In revisione",
};

/* ── Activity group card (matches Approvals card layout) ── */

const ACTION_LABELS: Record<string, string> = {
  "issue.created": "Creata",
  "issue.updated": "Aggiornata",
  "issue.comment_added": "Commento",
  "issue.commented": "Commento",
  "issue.checked_out": "Checked out",
  "issue.released": "Rilasciata",
  "heartbeat.invoked": "Esecuzione",
  "heartbeat.cancelled": "Annullata",
  "approval.created": "Approvazione",
  "approval.approved": "Approvata",
  "approval.rejected": "Rifiutata",
  "cost.reported": "Costo",
  "cost.recorded": "Costo",
  "issue.document_created": "Documento",
  "issue.document_updated": "Doc aggiornato",
  "issue.attachment_added": "Allegato",
};

interface ActivityGroupProps {
  issueId: string;
  issueIdentifier: string | null;
  issueTitle: string | null;
  events: ActivityEvent[];
  agentMap: Map<string, Agent>;
  status: string | null;
  parentChain: Issue[];
  hasFailed: boolean;
  failedError?: string;
}

function ActivityGroupCard({
  issueId,
  issueIdentifier,
  issueTitle,
  events,
  agentMap,
  status,
  parentChain,
  hasFailed,
  failedError,
}: ActivityGroupProps) {
  const [openSection, setOpenSection] = useState<AccordionSection>(null);
  const toggleSection = (s: AccordionSection) => setOpenSection((prev) => (prev === s ? null : s));

  const lastEvent = events[0];
  const actor = lastEvent?.actorType === "agent" ? agentMap.get(lastEvent.actorId) : null;
  const s = cardStyle(status, hasFailed);

  return (
    <div className={cn("border rounded-lg overflow-hidden", s.border, s.bg)}>
      {/* Header */}
      <div className="px-4 py-3">
        {/* Parent chain breadcrumb (like Approvals) */}
        {parentChain.length > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground flex-wrap mb-2">
            {parentChain.map((parent, i) => (
              <span key={parent.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-2.5 w-2.5" />}
                <Link
                  to={`/issues/${parent.identifier ?? parent.id}`}
                  className="hover:underline hover:text-foreground"
                >
                  {parent.identifier && <span className="font-mono mr-0.5">{parent.identifier}</span>}
                  {parent.title}
                </Link>
              </span>
            ))}
            <ChevronRight className="h-2.5 w-2.5" />
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <Link
            to={`/issues/${issueIdentifier ?? issueId}`}
            className="min-w-0 no-underline text-inherit hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-2 mb-1">
              {statusIcon(status, hasFailed)}
              <span className="font-medium text-sm">
                {issueIdentifier && (
                  <span className="text-muted-foreground mr-1.5">{issueIdentifier}</span>
                )}
                {issueTitle ?? "Attivita'"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {actor && (
                <span className="flex items-center gap-1">
                  <Identity name={actor.name} size="sm" className="inline-flex" />
                </span>
              )}
              <span className={cn(
                "font-medium",
                hasFailed ? "text-red-400" :
                status === "blocked" ? "text-amber-400" :
                status === "done" ? "text-emerald-400" :
                status === "in_progress" ? "text-cyan-400" :
                "text-muted-foreground",
              )}>
                {hasFailed ? "Errore" : STATUS_LABELS[status ?? ""] ?? status}
              </span>
              <span>{timeAgo(lastEvent?.createdAt)}</span>
            </div>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
              {events.length} {events.length === 1 ? "evento" : "eventi"}
            </span>
          </div>
        </div>

        {/* Error message if failed */}
        {hasFailed && failedError && (
          <p className="text-[11px] text-red-400 mt-2 px-2 py-1.5 rounded bg-red-500/10 font-mono truncate">
            {failedError}
          </p>
        )}
      </div>

      {/* Accordion tabs */}
      <div className={cn("flex border-t", s.tabBorder)}>
        <AccordionTabButton
          label="Dettagli"
          isOpen={openSection === "dettagli"}
          onClick={() => toggleSection("dettagli")}
          style={s}
        />
        <AccordionTabButton
          label="Timeline"
          isOpen={openSection === "timeline"}
          onClick={() => toggleSection("timeline")}
          style={s}
        />
      </div>

      {/* Accordion content */}
      {openSection === "dettagli" && (
        <div className={cn("border-t px-4 py-3 text-xs space-y-2", s.tabBorder)}>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Stato:</span>
            <span className={cn(
              "font-medium",
              hasFailed ? "text-red-400" :
              status === "blocked" ? "text-amber-400" :
              status === "done" ? "text-emerald-400" :
              status === "in_progress" ? "text-cyan-400" :
              "",
            )}>
              {hasFailed ? "Errore" : STATUS_LABELS[status ?? ""] ?? status?.replace(/_/g, " ") ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Ultima azione:</span>
            <span>{ACTION_LABELS[lastEvent?.action] ?? lastEvent?.action}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Agente:</span>
            <span>{actor?.name ?? "Sistema"}</span>
          </div>
        </div>
      )}

      {openSection === "timeline" && (
        <div className={cn("border-t px-4 py-2 max-h-48 overflow-y-auto", s.tabBorder)}>
          {events.map((event) => {
            const evtActor = event.actorType === "agent" ? agentMap.get(event.actorId) : null;
            return (
              <div key={event.id} className="flex items-center gap-2 py-1.5 border-b border-border/20 last:border-b-0">
                <Identity name={evtActor?.name ?? "Sistema"} size="xs" />
                <span className="text-[11px] text-muted-foreground flex-1 truncate">
                  {ACTION_LABELS[event.action] ?? event.action.replace(/[._]/g, " ")}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(event.createdAt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Ungrouped event card ── */

function UngroupedEventCard({ event, agentMap }: { event: ActivityEvent; agentMap: Map<string, Agent> }) {
  const actor = event.actorType === "agent" ? agentMap.get(event.actorId) : null;

  return (
    <div className="border border-border/30 bg-card/30 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2">
        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        <Identity name={actor?.name ?? "Sistema"} size="xs" />
        <span className="text-xs text-muted-foreground flex-1 truncate">
          {ACTION_LABELS[event.action] ?? event.action.replace(/[._]/g, " ")}
        </span>
        <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(event.createdAt)}</span>
      </div>
    </div>
  );
}

/* ── Main page ── */

export function Activity() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();

  const pathTab = location.pathname.split("/").pop() as ActivityTab;
  const tab: ActivityTab = VALID_TABS.includes(pathTab) ? pathTab : "recenti";

  useEffect(() => {
    setBreadcrumbs([{ label: t("activity.title") }]);
  }, [setBreadcrumbs]);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Fetch heartbeat runs for error detection
  const { data: allRuns } = useQuery({
    queryKey: [...queryKeys.liveRuns(selectedCompanyId ?? ""), "activity-runs"],
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const issueMap = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const i of issues ?? []) map.set(i.id, i);
    return map;
  }, [issues]);

  // Build failed issue IDs from runs
  const { failedIssueIds, failedIssueErrors } = useMemo(() => {
    const ids = new Set<string>();
    const errors = new Map<string, string>();
    if (!allRuns) return { failedIssueIds: ids, failedIssueErrors: errors };

    const latestByIssue = new Map<string, { status: string; error: string }>();
    for (const run of allRuns) {
      const issueId = (run as any).contextSnapshot?.issueId;
      if (!issueId) continue;
      if (!latestByIssue.has(issueId)) {
        latestByIssue.set(issueId, { status: run.status, error: run.error ?? "" });
      }
    }
    for (const [issueId, { status, error }] of latestByIssue) {
      if (status === "failed") {
        ids.add(issueId);
        if (error) errors.set(issueId, error);
      }
    }
    return { failedIssueIds: ids, failedIssueErrors: errors };
  }, [allRuns]);

  // Build parent chain for an issue
  function buildParentChain(issueId: string): Issue[] {
    const chain: Issue[] = [];
    let current = issueMap.get(issueId);
    const visited = new Set<string>();
    while (current?.parentId && !visited.has(current.parentId)) {
      visited.add(current.parentId);
      const parent = issueMap.get(current.parentId);
      if (parent) {
        chain.unshift(parent);
        current = parent;
      } else break;
    }
    return chain;
  }

  // Group events by issue
  const { issueGroups, ungrouped } = useMemo(() => {
    if (!data) return { issueGroups: [], ungrouped: [] };

    const groupMap = new Map<string, ActivityEvent[]>();
    const ungroupedList: ActivityEvent[] = [];

    for (const event of data) {
      if (event.entityType === "issue" && event.entityId) {
        if (!groupMap.has(event.entityId)) groupMap.set(event.entityId, []);
        groupMap.get(event.entityId)!.push(event);
      } else {
        ungroupedList.push(event);
      }
    }

    const groups = Array.from(groupMap.entries()).map(([issueId, events]) => {
      const info = issueMap.get(issueId);
      return {
        issueId,
        issueIdentifier: info?.identifier ?? null,
        issueTitle: info?.title ?? null,
        status: info?.status ?? null,
        events,
        lastActivity: new Date(events[0]?.createdAt ?? 0).getTime(),
      };
    }).sort((a, b) => b.lastActivity - a.lastActivity);

    return { issueGroups: groups, ungrouped: ungroupedList };
  }, [data, issueMap]);

  // Filter by tab
  const filteredGroups = useMemo(() => {
    if (tab === "recenti") return issueGroups;
    if (tab === "in_corso") return issueGroups.filter((g) => g.status === "in_progress" || g.status === "blocked" || g.status === "todo");
    if (tab === "completate") return issueGroups.filter((g) => g.status === "done" || g.status === "cancelled");
    return issueGroups;
  }, [issueGroups, tab]);

  if (!selectedCompanyId) {
    return <EmptyState icon={History} message={t("activity.selectCompany")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const counts = {
    recenti: issueGroups.length,
    in_corso: issueGroups.filter((g) => g.status === "in_progress" || g.status === "blocked" || g.status === "todo").length,
    completate: issueGroups.filter((g) => g.status === "done" || g.status === "cancelled").length,
  };

  // Count errors in "in corso" tab
  const errorCount = issueGroups.filter((g) =>
    (g.status === "in_progress" || g.status === "blocked" || g.status === "todo") &&
    failedIssueIds.has(g.issueId),
  ).length;

  const tabItems = [
    {
      value: "recenti",
      label: (
        <span className="flex items-center gap-1.5">
          Recenti
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10">{counts.recenti}</span>
        </span>
      ),
    },
    {
      value: "in_corso",
      label: (
        <span className="flex items-center gap-1.5">
          In corso
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">{counts.in_corso}</span>
          {errorCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">{errorCount} err</span>
          )}
        </span>
      ),
    },
    {
      value: "completate",
      label: (
        <span className="flex items-center gap-1.5">
          Completate
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">{counts.completate}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => navigate(`/activity/${v}`, { replace: true })}>
        <PageTabBar items={tabItems} value={tab} onValueChange={(v) => navigate(`/activity/${v}`, { replace: true })} />
      </Tabs>

      {filteredGroups.length === 0 && ungrouped.length === 0 && (
        <EmptyState icon={History} message={tab === "completate" ? "Nessuna attivita' completata." : tab === "in_corso" ? "Nessuna attivita' in corso." : t("activity.none")} />
      )}

      <div className="grid gap-3">
        {filteredGroups.map((group) => (
          <ActivityGroupCard
            key={group.issueId}
            issueId={group.issueId}
            issueIdentifier={group.issueIdentifier}
            issueTitle={group.issueTitle}
            events={group.events}
            agentMap={agentMap}
            status={group.status}
            parentChain={buildParentChain(group.issueId)}
            hasFailed={failedIssueIds.has(group.issueId)}
            failedError={failedIssueErrors.get(group.issueId)}
          />
        ))}
        {tab === "recenti" && ungrouped.slice(0, 10).map((event) => (
          <UngroupedEventCard key={event.id} event={event} agentMap={agentMap} />
        ))}
      </div>
    </div>
  );
}
