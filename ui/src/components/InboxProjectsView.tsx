import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import {
  ProjectInboxCard,
  buildProjectCardItem,
  type ProjectInboxCardItem,
} from "./ProjectInboxCard";
import { ALERT_CATEGORY_LEGEND } from "./AlertRow";
import { AlertDrawer } from "./AlertDrawer";
import { EmptyState } from "./EmptyState";
import { FolderKanban, Search } from "lucide-react";
import type { Agent, Issue, Project } from "@paperclipai/shared";
import type { InboxWorkItem, InboxItemCategory } from "../lib/inbox";
import { categorizeWorkItem, resolveItemContext } from "../lib/inbox";
import type { AlertUnreadState } from "./AlertRow";

type TypeFilter = "all" | InboxItemCategory;
type StatusFilter = "all" | "new" | "actionable";

/**
 * InboxProjectsView
 *
 * Global filters (Tipo / Stato / ricerca) apply across ALL cards.
 * Cards are rendered in a responsive grid:
 *   <640px  : 1 col
 *   <1024px : 2 col
 *   ≥1024px : 3 col with auto-fit so wider viewports add more
 *
 * Items are bucketed by projectId, with a fallback "Senza progetto" bucket.
 * Cards are ordered by most recent activity (freshest project first).
 */

interface InboxProjectsViewProps {
  allWorkItems: InboxWorkItem[];
  agentById: Map<string, Agent>;
  issueById: Map<string, Issue>;
  projectById: Map<string, Project>;
  projects: Project[];
  computeUnreadState: (item: InboxWorkItem) => AlertUnreadState;
  buildItemHandlers: (item: InboxWorkItem) => {
    fallbackHref?: string;
    onApprove?: () => void;
    onReview?: () => void;
    /** Receives the drawer payload `[until=VALUE] motivo` so the caller can
     *  parse it and POST /issues/:id/suspend. The quick-action shortcut on the
     *  inbox card (without drawer) passes no argument, so the parameter is
     *  optional. */
    onSuspend?: (note?: string) => void;
    onBlock?: () => void;
    onRetry?: () => void;
    onArchive?: () => void;
    isPending?: boolean;
    isRetrying?: boolean;
  };
}

function itemSearchHaystack(
  item: InboxWorkItem,
  issueById: Map<string, Issue>,
): string {
  if (item.kind === "issue") {
    return `${item.issue.title} ${item.issue.identifier ?? ""}`.toLowerCase();
  }
  if (item.kind === "approval") {
    return `${item.approval.type} ${item.approval.status}`.toLowerCase();
  }
  if (item.kind === "failed_run") {
    const ctx = item.run.contextSnapshot as Record<string, unknown> | null;
    const iid = ctx ? (ctx["issueId"] ?? ctx["taskId"]) : null;
    const issue = typeof iid === "string" ? issueById.get(iid) ?? null : null;
    return `${item.run.error ?? ""} ${issue?.title ?? ""}`.toLowerCase();
  }
  return `${item.joinRequest.agentName ?? ""}`.toLowerCase();
}

function readProjectIdForItem(
  item: InboxWorkItem,
  issueById: Map<string, Issue>,
): string | null {
  if (item.kind === "issue") {
    return item.issue.projectId ?? null;
  }
  if (item.kind === "approval") {
    // Approvals don't carry projectId directly; try via linked issue if present.
    const target = item.approval as unknown as { targetType?: string; targetId?: string };
    if (target?.targetType === "issue" && typeof target.targetId === "string") {
      const issue = issueById.get(target.targetId);
      if (issue) return issue.projectId ?? null;
    }
    return null;
  }
  if (item.kind === "failed_run") {
    const ctx = item.run.contextSnapshot as Record<string, unknown> | null;
    const iid = ctx ? ctx["issueId"] ?? ctx["taskId"] : null;
    if (typeof iid === "string") {
      const issue = issueById.get(iid);
      if (issue) return issue.projectId ?? null;
    }
    return null;
  }
  return null;
}

export function InboxProjectsView({
  allWorkItems,
  agentById,
  issueById,
  projectById,
  projects,
  computeUnreadState,
  buildItemHandlers,
}: InboxProjectsViewProps) {
  const { t } = useTranslation();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [openItem, setOpenItem] = useState<InboxWorkItem | null>(null);

  // 1) Apply global filters
  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allWorkItems.filter((item) => {
      if (typeFilter !== "all" && categorizeWorkItem(item) !== typeFilter) return false;
      if (statusFilter !== "all") {
        const us = computeUnreadState(item);
        if (statusFilter === "new" && us !== "new") return false;
        if (statusFilter === "actionable" && us !== "actionable") return false;
      }
      if (needle && !itemSearchHaystack(item, issueById).includes(needle)) return false;
      return true;
    });
  }, [allWorkItems, typeFilter, statusFilter, search, computeUnreadState, issueById]);

  // 2) Group by projectId (fallback = null bucket)
  const grouped = useMemo(() => {
    const buckets = new Map<
      string | "__none__",
      {
        project: Project | null;
        items: ProjectInboxCardItem[];
        latest: number;
      }
    >();

    for (const item of filteredItems) {
      const pid = readProjectIdForItem(item, issueById);
      const bucketKey = pid ?? "__none__";
      const existing = buckets.get(bucketKey);
      const project = pid ? projectById.get(pid) ?? null : null;

      const unreadState = computeUnreadState(item);
      const handlers = buildItemHandlers(item);
      // Override fallback navigation with drawer open. The fallbackHref is
      // still kept as a secondary path for middle-click / right-click → "open
      // in new tab" behavior, but onOpen takes precedence on a normal click.
      const cardItem = buildProjectCardItem({
        item,
        agentById,
        issueById,
        projectById,
        unreadState,
        ...handlers,
      });
      cardItem.onOpen = () => setOpenItem(item);
      // Hover "Sospendi" button just opens the drawer — the actual suspend
      // flow (with "until when" presets) lives inside the drawer header.
      cardItem.onSuspend = () => setOpenItem(item);
      // Same for review — keeps the hover action surface minimal without
      // duplicating the drawer's business logic outside.
      cardItem.onReview = () => setOpenItem(item);

      if (existing) {
        existing.items.push(cardItem);
        if (item.timestamp > existing.latest) existing.latest = item.timestamp;
      } else {
        buckets.set(bucketKey, {
          project,
          items: [cardItem],
          latest: item.timestamp,
        });
      }
    }

    // Sort buckets: freshest activity first, "Senza progetto" last
    return Array.from(buckets.entries())
      .map(([key, bucket]) => ({ key, ...bucket }))
      .sort((a, b) => {
        if (a.key === "__none__") return 1;
        if (b.key === "__none__") return -1;
        return b.latest - a.latest;
      });
  }, [filteredItems, projectById, agentById, issueById, computeUnreadState, buildItemHandlers]);

  // Unused but intentional: kept for the empty/"no projects yet" state distinction
  void projects;

  // Flat list of visible items in the exact display order (bucket by bucket,
  // within each bucket newest → oldest — matching ProjectInboxCard's sort).
  // Used by the drawer's ↑/↓ keyboard navigation so the user can triage the
  // inbox without closing and reopening.
  const flatVisibleItems = useMemo<InboxWorkItem[]>(() => {
    const result: InboxWorkItem[] = [];
    for (const bucket of grouped) {
      const sorted = [...bucket.items].sort(
        (a, b) => b.item.timestamp - a.item.timestamp,
      );
      for (const entry of sorted) result.push(entry.item);
    }
    return result;
  }, [grouped]);

  const keyOfItem = (item: InboxWorkItem): string => {
    if (item.kind === "issue") return `issue:${item.issue.id}`;
    if (item.kind === "approval") return `approval:${item.approval.id}`;
    if (item.kind === "failed_run") return `run:${item.run.id}`;
    return `join:${item.joinRequest.id}`;
  };

  const openItemIndex = useMemo(() => {
    if (!openItem) return -1;
    const targetKey = keyOfItem(openItem);
    return flatVisibleItems.findIndex((i) => keyOfItem(i) === targetKey);
  }, [openItem, flatVisibleItems]);

  const navigateDrawer = (direction: 1 | -1) => {
    if (openItemIndex < 0 || flatVisibleItems.length === 0) return;
    const nextIdx =
      (openItemIndex + direction + flatVisibleItems.length) %
      flatVisibleItems.length;
    setOpenItem(flatVisibleItems[nextIdx]);
  };

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Type filter pills */}
        <div className="flex items-center gap-1 rounded-full bg-muted p-1">
          {(["all", "richiesta", "messaggio", "aggiornamento"] as TypeFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setTypeFilter(f)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                typeFilter === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f === "all"
                ? t("inbox.filterAll")
                : f === "richiesta"
                ? t("inbox.filterRequest")
                : f === "messaggio"
                ? t("inbox.filterMessage")
                : t("inbox.filterUpdate")}
            </button>
          ))}
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1 rounded-full bg-muted p-1">
          {(["all", "new", "actionable"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                statusFilter === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f === "all"
                ? t("inbox.statusAll")
                : f === "new"
                ? t("inbox.statusNew")
                : t("inbox.statusActionable")}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto w-full max-w-[260px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("inbox.searchPlaceholder")}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Legend — tiny, inline, self-documenting */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="uppercase tracking-wide">Legenda:</span>
        {ALERT_CATEGORY_LEGEND.map(({ category, label, textClass, Icon }) => (
          <span key={category} className={cn("inline-flex items-center gap-1 font-medium", textClass)}>
            <Icon className="h-2.5 w-2.5" />
            {label.toUpperCase()}
          </span>
        ))}
      </div>

      {/* Grid of project cards */}
      {grouped.length === 0 ? (
        <EmptyState icon={FolderKanban} message={t("inbox.noProjects")} />
      ) : (
        <div
          className={cn(
            "grid gap-4",
            "grid-cols-1", // mobile
            "md:grid-cols-2", // tablet
            "xl:grid-cols-3", // desktop
            "2xl:grid-cols-4", // large desktop
          )}
        >
          {grouped.map((bucket) => (
            <ProjectInboxCard
              key={bucket.key}
              project={bucket.project}
              items={bucket.items}
              leadAgent={
                bucket.project?.leadAgentId
                  ? agentById.get(bucket.project.leadAgentId) ?? null
                  : null
              }
              issueById={issueById}
              onBulkArchiveRead={() => {
                // Archive every already-read item in this bucket. Each item's
                // onArchive handler is fired sequentially — the queries will
                // invalidate and the cards refresh automatically.
                for (const entry of bucket.items) {
                  if (entry.unreadState === "read" && entry.onArchive) {
                    entry.onArchive();
                  }
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Drawer (portal) */}
      {openItem && (
        <AlertDrawer
          item={openItem}
          context={resolveItemContext(openItem, agentById, issueById, projectById)}
          issueById={issueById}
          agentById={agentById}
          onPrev={() => navigateDrawer(-1)}
          onNext={() => navigateDrawer(1)}
          positionLabel={
            openItemIndex >= 0
              ? `${openItemIndex + 1} / ${flatVisibleItems.length}`
              : undefined
          }
          onClose={() => setOpenItem(null)}
          onApprove={(note) => {
            const handlers = buildItemHandlers(openItem);
            handlers.onApprove?.();
            void note; // note will be wired when the approval API supports it
            setOpenItem(null);
          }}
          onReview={(note) => {
            void note;
            setOpenItem(null);
          }}
          onBlock={(note) => {
            void note;
            setOpenItem(null);
          }}
          onSuspend={(note) => {
            const handlers = buildItemHandlers(openItem);
            handlers.onSuspend?.(note);
            setOpenItem(null);
          }}
          onArchive={() => {
            const handlers = buildItemHandlers(openItem);
            handlers.onArchive?.();
          }}
        />
      )}
    </div>
  );
}
