import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation, Link } from "@/lib/router";
import { activityApi } from "../api/activity";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
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
  Search,
  X,
  MessageSquare,
  Zap,
  ShieldCheck,
  Cog,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  User,
  Bot,
} from "lucide-react";
import type { Agent, ActivityEvent, Issue, Project } from "@paperclipai/shared";

/* ══════════════════════════════════════════════════════════════════════
   Activity feed — rebuilt S42

   A chronological, filterable timeline of everything happening across
   the company: comments, runs, approvals, system events. Layout
   mirrors the Inbox page visually (same PageTabBar + chip filters +
   compact rows) but the data flow is different: Inbox is "what needs
   my attention", Activity is "what already happened".

   Three axes of filtering:
   1. Time bucket (tab): Oggi / Ieri / Settimana / Sempre
   2. Category (chips): Tutto / Commenti / Esecuzioni / Decisioni / Sistema
   3. Free-form filters: search text + agent dropdown + project dropdown

   Rendering groups events by local day, newest first. Consecutive
   events for the same issue+actor within 5 minutes collapse into a
   single summary row that the user can expand — keeps the feed
   scannable when a workflow bursts a dozen events.
   ══════════════════════════════════════════════════════════════════ */

/* ── Time buckets (tab) ───────────────────────────────────────────── */

type TimeBucket = "today" | "yesterday" | "week" | "all";
const VALID_BUCKETS: TimeBucket[] = ["today", "yesterday", "week", "all"];

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function bucketForEvent(eventAt: Date, now: Date = new Date()): TimeBucket {
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const ts = eventAt.getTime();
  if (ts >= today.getTime()) return "today";
  if (ts >= yesterday.getTime()) return "yesterday";
  if (ts >= weekAgo.getTime()) return "week";
  return "all";
}

/** Returns true if `ev` matches the selected time bucket (cumulative:
 * "week" also includes today + yesterday). */
function matchesBucket(ev: ActivityEvent, bucket: TimeBucket, now: Date = new Date()): boolean {
  if (bucket === "all") return true;
  const today = startOfDay(now);
  const ts = new Date(ev.createdAt).getTime();
  if (bucket === "today") return ts >= today.getTime();
  if (bucket === "yesterday") {
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    return ts >= yest.getTime() && ts < today.getTime();
  }
  // week = last 7 days including today
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  return ts >= weekAgo.getTime();
}

/* ── Categories ───────────────────────────────────────────────────── */

type ActivityCategory = "comment" | "execution" | "decision" | "system";
type CategoryFilter = "all" | ActivityCategory;

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  comment: "Commenti",
  execution: "Esecuzioni",
  decision: "Decisioni",
  system: "Sistema",
};

const CATEGORY_COLORS: Record<ActivityCategory, { bg: string; text: string; dot: string }> = {
  comment: { bg: "bg-sky-500/10", text: "text-sky-400", dot: "bg-sky-500" },
  execution: { bg: "bg-cyan-500/10", text: "text-cyan-400", dot: "bg-cyan-500" },
  decision: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-500" },
  system: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

const CATEGORY_ICONS: Record<ActivityCategory, typeof MessageSquare> = {
  comment: MessageSquare,
  execution: Zap,
  decision: ShieldCheck,
  system: Cog,
};

/** Map an action string to a category. Unknown actions fall back to
 * "system" so nothing disappears from the feed. */
function categorizeAction(action: string): ActivityCategory {
  if (
    action === "issue.comment_added" ||
    action === "issue.commented" ||
    action === "approval.commented"
  ) return "comment";
  if (
    action.startsWith("heartbeat.") ||
    action === "issue.checked_out" ||
    action === "issue.released" ||
    action === "issue.suspend_expired" ||
    action === "issue.checkout_lock_adopted"
  ) return "execution";
  if (
    action.startsWith("approval.") ||
    action === "issue.updated" ||
    action === "issue.created" ||
    action === "issue.document_created" ||
    action === "issue.document_updated" ||
    action === "issue.attachment_added"
  ) return "decision";
  return "system";
}

/* ── Human-readable action labels ─────────────────────────────────── */

const ACTION_LABELS: Record<string, string> = {
  "issue.created": "Creata",
  "issue.updated": "Aggiornata",
  "issue.comment_added": "Commento",
  "issue.commented": "Commento",
  "issue.checked_out": "Presa in carico",
  "issue.released": "Rilasciata",
  "issue.document_created": "Documento creato",
  "issue.document_updated": "Documento aggiornato",
  "issue.attachment_added": "Allegato aggiunto",
  "issue.lock_released": "Lock rilasciato",
  "issue.suspend_expired": "Sospensione scaduta",
  "issue.checkout_lock_adopted": "Lock adottato",
  "heartbeat.invoked": "Run avviato",
  "heartbeat.cancelled": "Run annullato",
  "approval.created": "Approvazione richiesta",
  "approval.approved": "Approvata",
  "approval.rejected": "Rifiutata",
  "approval.revision_requested": "Revisione richiesta",
  "cost.reported": "Costo registrato",
  "cost.recorded": "Costo registrato",
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");
}

/* ── Actor display ────────────────────────────────────────────────── */

function actorName(ev: ActivityEvent, agentMap: Map<string, Agent>): string {
  if (ev.actorType === "agent") {
    const agentId = ev.agentId ?? ev.actorId;
    return agentMap.get(agentId)?.name ?? "Agente";
  }
  if (ev.actorType === "system") return "Sistema";
  return "Utente";
}

/* ── Linkable target resolution ───────────────────────────────────── */

interface EventTarget {
  href: string | null;
  label: string;
  identifier: string | null;
}

function resolveTarget(ev: ActivityEvent, issueMap: Map<string, Issue>): EventTarget {
  if (ev.entityType === "issue") {
    const issue = issueMap.get(ev.entityId);
    if (issue) {
      return {
        href: `/issues/${issue.identifier ?? issue.id}`,
        label: issue.title,
        identifier: issue.identifier ?? null,
      };
    }
    // Issue we don't have cached yet — details often carry identifier/title
    const det = ev.details as Record<string, unknown> | null;
    const ident = det && typeof det.identifier === "string" ? det.identifier : null;
    const title = det && typeof det.issueTitle === "string" ? det.issueTitle : "Issue";
    return {
      href: ident ? `/issues/${ident}` : `/issues/${ev.entityId}`,
      label: title,
      identifier: ident,
    };
  }
  if (ev.entityType === "heartbeat_run") {
    const det = ev.details as Record<string, unknown> | null;
    const agentId = det && typeof det.agentId === "string" ? det.agentId : (ev.agentId ?? null);
    if (agentId) {
      return {
        href: `/agents/${agentId}/runs/${ev.entityId}`,
        label: "Run",
        identifier: null,
      };
    }
  }
  if (ev.entityType === "approval") {
    return {
      href: `/approvals/${ev.entityId}`,
      label: "Approvazione",
      identifier: null,
    };
  }
  return { href: null, label: ev.entityType, identifier: null };
}

/* ══════════════════════════════════════════════════════════════════
   Collapsed burst grouping

   When the same issue receives 3+ events from the same actor in a
   5-minute window, fold them into a single summary row that the user
   can expand. Prevents noisy workflows from drowning the feed.
   ══════════════════════════════════════════════════════════════════ */

interface FeedRow {
  key: string;
  firstEventAt: Date;
  events: ActivityEvent[];
  /** True if the row should start collapsed. */
  collapsed: boolean;
}

const BURST_WINDOW_MS = 5 * 60 * 1000;
const BURST_MIN_SIZE = 3;

function buildFeedRows(events: ActivityEvent[]): FeedRow[] {
  // Events arrive newest-first from the API. Walk linearly and merge
  // adjacent runs that share (entityType, entityId, actorId) AND fall
  // within BURST_WINDOW_MS of the latest event in the current run.
  const rows: FeedRow[] = [];
  let current: FeedRow | null = null;
  for (const ev of events) {
    const evAt = new Date(ev.createdAt);
    if (
      current &&
      current.events.length > 0 &&
      current.events[0].entityType === ev.entityType &&
      current.events[0].entityId === ev.entityId &&
      current.events[0].actorId === ev.actorId &&
      current.events[current.events.length - 1].createdAt &&
      Math.abs(
        new Date(current.events[current.events.length - 1].createdAt).getTime() - evAt.getTime(),
      ) <= BURST_WINDOW_MS
    ) {
      current.events.push(ev);
      current.firstEventAt = evAt;
      continue;
    }
    if (current) rows.push(current);
    current = {
      key: `${ev.id}`,
      firstEventAt: evAt,
      events: [ev],
      collapsed: true,
    };
  }
  if (current) rows.push(current);

  // Promote bursts to collapsed-by-default, singleton rows stay as-is.
  return rows.map((r) => ({
    ...r,
    collapsed: r.events.length >= BURST_MIN_SIZE,
  }));
}

/* ── Day grouping ─────────────────────────────────────────────────── */

interface DayGroup {
  dayKey: string;
  dayLabel: string;
  rows: FeedRow[];
}

const DAY_FMT = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function formatDayLabel(d: Date, now: Date = new Date()): string {
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = startOfDay(d);
  if (day.getTime() === today.getTime()) return "Oggi";
  if (day.getTime() === yesterday.getTime()) return "Ieri";
  return DAY_FMT.format(d);
}

function groupByDay(rows: FeedRow[], now: Date = new Date()): DayGroup[] {
  const byDay = new Map<string, { label: string; rows: FeedRow[] }>();
  for (const row of rows) {
    const day = startOfDay(row.firstEventAt);
    const key = day.toISOString();
    if (!byDay.has(key)) {
      byDay.set(key, { label: formatDayLabel(day, now), rows: [] });
    }
    byDay.get(key)!.rows.push(row);
  }
  return Array.from(byDay.entries()).map(([dayKey, { label, rows }]) => ({
    dayKey,
    dayLabel: label,
    rows,
  }));
}

/* ══════════════════════════════════════════════════════════════════
   Row component
   ══════════════════════════════════════════════════════════════════ */

function ActivityFeedRow({
  row,
  agentMap,
  issueMap,
  projectMap,
}: {
  row: FeedRow;
  agentMap: Map<string, Agent>;
  issueMap: Map<string, Issue>;
  projectMap: Map<string, Project>;
}) {
  const [expanded, setExpanded] = useState(!row.collapsed);
  const latest = row.events[row.events.length - 1]; // oldest in this burst
  const head = row.events[0]; // most recent
  const category = categorizeAction(head.action);
  const Icon = CATEGORY_ICONS[category];
  const colors = CATEGORY_COLORS[category];
  const isBurst = row.events.length >= BURST_MIN_SIZE;
  const time = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" })
    .format(row.firstEventAt);

  const target = resolveTarget(head, issueMap);
  const actor = actorName(head, agentMap);
  const issue = head.entityType === "issue" ? issueMap.get(head.entityId) : null;
  const project = issue?.projectId ? projectMap.get(issue.projectId) : null;
  const details = head.details as Record<string, unknown> | null;
  const snippet = details && typeof details.bodySnippet === "string"
    ? details.bodySnippet
    : null;

  const actionLabel = formatAction(head.action);

  return (
    <div className="group relative flex gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors">
      {/* Time column */}
      <div className="shrink-0 w-12 pt-0.5 text-right">
        <span className="text-[10px] font-mono text-muted-foreground/70">{time}</span>
      </div>

      {/* Category icon */}
      <div className={cn("shrink-0 flex h-6 w-6 items-center justify-center rounded-full mt-0.5", colors.bg)}>
        <Icon className={cn("h-3 w-3", colors.text)} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[10px] font-medium uppercase tracking-wide shrink-0", colors.text)}>
            {actionLabel}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">·</span>
          <div className="flex items-center gap-1 shrink-0">
            {head.actorType === "agent" ? (
              // Identity already renders the name alongside its avatar chip;
              // an extra <span> would duplicate it.
              <Identity name={actor} size="xs" />
            ) : (
              <>
                {head.actorType === "system" ? (
                  <Cog className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <User className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="text-xs text-foreground/80">{actor}</span>
              </>
            )}
          </div>
          {isBurst && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="inline-flex items-center gap-0.5 rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
              {row.events.length} eventi
            </button>
          )}
        </div>

        {/* Target line */}
        {target.href ? (
          <Link
            to={target.href}
            className="mt-0.5 flex items-baseline gap-1.5 text-sm no-underline text-inherit hover:underline"
          >
            {target.identifier && (
              <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                {target.identifier}
              </span>
            )}
            <span className="truncate text-foreground">{target.label}</span>
          </Link>
        ) : (
          <div className="mt-0.5 text-sm text-foreground/70 truncate">{target.label}</div>
        )}

        {/* Project context (when the target is an issue) */}
        {project && (
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <FolderOpen className="h-2.5 w-2.5" />
            <span>{project.name}</span>
          </div>
        )}

        {/* Comment snippet preview */}
        {category === "comment" && snippet && (
          <div className="mt-1 border-l-2 border-sky-500/30 pl-2 text-xs text-muted-foreground line-clamp-2">
            "{snippet}"
          </div>
        )}

        {/* Expanded burst: show all sub-events */}
        {isBurst && expanded && (
          <div className="mt-2 space-y-1 border-l-2 border-border/30 pl-3">
            {row.events.slice(1).map((ev) => {
              const evTime = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" })
                .format(new Date(ev.createdAt));
              return (
                <div key={ev.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono text-[10px]">{evTime}</span>
                  <span>{formatAction(ev.action)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Relative time on the right */}
      <div className="shrink-0 self-center text-[10px] text-muted-foreground/60 tabular-nums">
        {timeAgo(latest.createdAt)}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Main page
   ══════════════════════════════════════════════════════════════════ */

export function Activity() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();

  const pathTab = location.pathname.split("/").pop() as TimeBucket;
  const tab: TimeBucket = VALID_BUCKETS.includes(pathTab) ? pathTab : "today";

  // URL query params for category/search/agent/project filters
  const urlParams = new URLSearchParams(location.search);
  const urlCategory = urlParams.get("category") as CategoryFilter | null;
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(
    urlCategory && ["comment", "execution", "decision", "system"].includes(urlCategory)
      ? urlCategory
      : "all",
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");

  useEffect(() => {
    setBreadcrumbs([{ label: t("activity.title") }]);
  }, [setBreadcrumbs]);

  /* ── Data ─────────────────────────────────────────────────────── */

  const { data: events, isLoading } = useQuery({
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

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
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

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects ?? []) map.set(p.id, p);
    return map;
  }, [projects]);

  /* ── Filtering ────────────────────────────────────────────────── */

  const allEvents = events ?? [];

  // Stable "now" within a single render pass so bucket assignment and
  // day labels agree even at midnight.
  const now = useMemo(() => new Date(), [events]);

  // Counts PER BUCKET (independent of the selected bucket, so tabs
  // always show the accurate size of each time window).
  const bucketCounts = useMemo(() => {
    const counts: Record<TimeBucket, number> = { today: 0, yesterday: 0, week: 0, all: 0 };
    for (const ev of allEvents) {
      counts.all += 1;
      if (matchesBucket(ev, "today", now)) counts.today += 1;
      if (matchesBucket(ev, "yesterday", now)) counts.yesterday += 1;
      if (matchesBucket(ev, "week", now)) counts.week += 1;
    }
    return counts;
  }, [allEvents, now]);

  // Events for the selected bucket, before any other filter.
  const bucketEvents = useMemo(
    () => allEvents.filter((ev) => matchesBucket(ev, tab, now)),
    [allEvents, tab, now],
  );

  // Category counts within the selected bucket (so pills reflect the
  // visible window, not the entire DB).
  const categoryCounts = useMemo(() => {
    const counts: Record<ActivityCategory, number> = { comment: 0, execution: 0, decision: 0, system: 0 };
    for (const ev of bucketEvents) {
      counts[categorizeAction(ev.action)]++;
    }
    return counts;
  }, [bucketEvents]);

  // Full filter stack: bucket → category → search → agent → project.
  const filteredEvents = useMemo(() => {
    let list = bucketEvents;
    if (categoryFilter !== "all") {
      list = list.filter((ev) => categorizeAction(ev.action) === categoryFilter);
    }
    if (agentFilter) {
      list = list.filter((ev) => ev.agentId === agentFilter || ev.actorId === agentFilter);
    }
    if (projectFilter) {
      list = list.filter((ev) => {
        if (ev.entityType !== "issue") return false;
        const issue = issueMap.get(ev.entityId);
        return issue?.projectId === projectFilter;
      });
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((ev) => {
        const det = ev.details as Record<string, unknown> | null;
        const fields: string[] = [
          ev.action,
          formatAction(ev.action),
          actorName(ev, agentMap),
        ];
        if (det) {
          if (typeof det.bodySnippet === "string") fields.push(det.bodySnippet);
          if (typeof det.identifier === "string") fields.push(det.identifier);
          if (typeof det.issueTitle === "string") fields.push(det.issueTitle);
        }
        if (ev.entityType === "issue") {
          const issue = issueMap.get(ev.entityId);
          if (issue) {
            fields.push(issue.title);
            if (issue.identifier) fields.push(issue.identifier);
          }
        }
        return fields.some((f) => f.toLowerCase().includes(q));
      });
    }
    return list;
  }, [bucketEvents, categoryFilter, agentFilter, projectFilter, searchQuery, agentMap, issueMap]);

  /* ── Grouping ─────────────────────────────────────────────────── */

  const days = useMemo(() => {
    const rows = buildFeedRows(filteredEvents);
    return groupByDay(rows, now);
  }, [filteredEvents, now]);

  /* ── Render ───────────────────────────────────────────────────── */

  if (!selectedCompanyId) {
    return <EmptyState icon={History} message={t("activity.selectCompany")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  // Labels as plain strings so PageTabBar's mobile fallback (which renders
  // a native <select>) can show the count inline. JSX labels would collapse
  // to the raw `value` on narrow viewports.
  const tabItems = [
    { value: "today", label: `Oggi (${bucketCounts.today})` },
    { value: "yesterday", label: `Ieri (${bucketCounts.yesterday})` },
    { value: "week", label: `Settimana (${bucketCounts.week})` },
    { value: "all", label: `Sempre (${bucketCounts.all})` },
  ];

  const hasActiveFilters =
    categoryFilter !== "all" || !!agentFilter || !!projectFilter || !!searchQuery.trim();

  const clearFilters = () => {
    setCategoryFilter("all");
    setAgentFilter("");
    setProjectFilter("");
    setSearchQuery("");
  };

  return (
    <div className="space-y-4">
      {/* Tab bar (time buckets) */}
      <Tabs value={tab} onValueChange={(v) => navigate(`/activity/${v}`, { replace: true })}>
        <PageTabBar
          items={tabItems}
          value={tab}
          onValueChange={(v) => navigate(`/activity/${v}`, { replace: true })}
        />
      </Tabs>

      {/* Category filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCategoryFilter("all")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            categoryFilter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent",
          )}
        >
          Tutto ({bucketEvents.length})
        </button>
        {(["comment", "execution", "decision", "system"] as ActivityCategory[]).map((cat) => {
          const Icon = CATEGORY_ICONS[cat];
          const active = categoryFilter === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat === categoryFilter ? "all" : cat)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent",
              )}
            >
              <Icon className="h-3 w-3" />
              <span>{CATEGORY_LABELS[cat]}</span>
              <span className={cn("text-[10px]", active ? "opacity-80" : "opacity-60")}>
                ({categoryCounts[cat]})
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + dropdown filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca nell'attivita'..."
            className="w-full rounded-md border border-border bg-background pl-8 pr-8 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Svuota ricerca"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Tutti gli agenti</option>
            {(agents ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Tutti i progetti</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
            Svuota filtri
          </button>
        )}
      </div>

      {/* Feed */}
      {filteredEvents.length === 0 ? (
        <EmptyState
          icon={History}
          message={
            hasActiveFilters
              ? "Nessun evento corrisponde ai filtri."
              : tab === "today"
              ? "Nessuna attivita' oggi."
              : tab === "yesterday"
              ? "Nessuna attivita' ieri."
              : tab === "week"
              ? "Nessuna attivita' questa settimana."
              : t("activity.none")
          }
        />
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <section key={day.dayKey}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {day.dayLabel}
                <span className="ml-2 font-normal text-muted-foreground/60">
                  ({day.rows.reduce((n, r) => n + r.events.length, 0)})
                </span>
              </h3>
              <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border/40">
                {day.rows.map((row) => (
                  <ActivityFeedRow
                    key={row.key}
                    row={row}
                    agentMap={agentMap}
                    issueMap={issueMap}
                    projectMap={projectMap}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
