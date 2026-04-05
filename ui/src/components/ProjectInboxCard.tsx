import { useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { cn } from "../lib/utils";
import { AlertRow, type AlertUnreadState } from "./AlertRow";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Send, ArrowUpRight, Archive } from "lucide-react";
import type { Agent, Issue, Project } from "@paperclipai/shared";
import type { InboxWorkItem, InboxItemContext } from "../lib/inbox";
import { resolveItemContext } from "../lib/inbox";

/**
 * ProjectInboxCard — a single project block in the inbox projects view.
 *
 * Layout:
 *   HEADER:
 *     - Project name (large)
 *     - Lead agent avatar/name (when set)
 *     - Collapse/expand
 *   BODY:
 *     - Alerts sorted newest → oldest (most recent at the TOP).
 *       (Original brief asked for oldest at top, founder revised this to
 *        newest-first for faster triage.)
 *     - Empty state if no alerts match current filters
 *   FOOTER:
 *     - Collapsed: "Scrivi al responsabile" button + unread count
 *     - Expanded: textarea + send button + cancel (Esc)
 *     - Progressive disclosure: no textarea always visible
 */

export interface ProjectInboxCardItem {
  item: InboxWorkItem;
  context: InboxItemContext;
  unreadState: AlertUnreadState;
  onOpen?: () => void;
  onApprove?: () => void;
  onReview?: () => void;
  onSuspend?: () => void;
  onBlock?: () => void;
  onRetry?: () => void;
  onArchive?: () => void;
  isPending?: boolean;
  isRetrying?: boolean;
  fallbackHref?: string;
}

interface ProjectInboxCardProps {
  project: Project | null; // null = "Senza progetto" bucket
  items: ProjectInboxCardItem[];
  leadAgent: Agent | null;
  issueById: Map<string, Issue>;
  onSendMessageToLead?: (projectId: string | null, message: string) => void;
  /** Bulk-archive: fires each item's own onArchive (if present) for items
   *  currently marked as read. The caller decides whether to require confirm. */
  onBulkArchiveRead?: () => void;
  className?: string;
}

/** Re-resolve ordering inside the card body: newest → oldest (top = freshest). */
function sortBodyItems(items: ProjectInboxCardItem[]): ProjectInboxCardItem[] {
  return [...items].sort((a, b) => b.item.timestamp - a.item.timestamp);
}

export function ProjectInboxCard({
  project,
  items,
  leadAgent,
  issueById,
  onSendMessageToLead,
  onBulkArchiveRead,
  className,
}: ProjectInboxCardProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const sortedItems = useMemo(() => sortBodyItems(items), [items]);

  const unreadCount = useMemo(
    () => items.filter((i) => i.unreadState !== "read").length,
    [items],
  );
  const readCount = items.length - unreadCount;

  const projectName = project?.name ?? "Senza progetto";
  const projectHref = project ? `/projects/${project.urlKey ?? project.id}` : null;
  const accentColor = project?.color ?? null;

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendMessageToLead?.(project?.id ?? null, trimmed);
    setDraft("");
    setComposerOpen(false);
  };

  const handleComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setComposerOpen(false);
      setDraft("");
    }
  };

  return (
    <div
      className={cn(
        // Fixed visual height so all cards in the grid stay aligned regardless
        // of how many alerts they contain. The body gets its own scroll.
        // h-[560px] = ~8 rows of alerts visible at once, tuned empirically.
        "flex h-[560px] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        className,
      )}
    >
      {/* HEADER */}
      <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
        {accentColor && (
          <span
            aria-hidden="true"
            className="mt-1 h-8 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {projectHref ? (
              <Link
                to={projectHref}
                className="truncate text-sm font-semibold text-foreground no-underline hover:underline"
              >
                {projectName}
              </Link>
            ) : (
              <span className="truncate text-sm font-semibold text-foreground">
                {projectName}
              </span>
            )}
            {projectHref && (
              <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </div>
          {leadAgent && (
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
              <Link
                to={`/agents/${leadAgent.id}`}
                className="inline-flex items-center gap-1 no-underline hover:text-foreground"
                title={t("inbox.projectLead")}
              >
                {leadAgent.icon && <span className="text-[11px]">{leadAgent.icon}</span>}
                <span className="truncate">{leadAgent.name}</span>
              </Link>
            </div>
          )}
        </div>

        {onBulkArchiveRead && readCount > 0 && (
          <button
            type="button"
            onClick={onBulkArchiveRead}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`Archivia ${readCount} alert gestiti`}
            title={`Archivia ${readCount} alert gestiti`}
          >
            <Archive className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((p) => !p)}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={collapsed ? t("inbox.expand") : t("inbox.collapse")}
          title={collapsed ? t("inbox.expand") : t("inbox.collapse")}
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {/* BODY */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto">
          {sortedItems.length === 0 ? (
            <div className="flex min-h-[80px] items-center justify-center px-4 py-6 text-xs text-muted-foreground">
              {t("inbox.noAlertsInProject")}
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {sortedItems.map((entry) => {
                const key =
                  entry.item.kind === "issue"
                    ? `issue:${entry.item.issue.id}`
                    : entry.item.kind === "approval"
                    ? `approval:${entry.item.approval.id}`
                    : entry.item.kind === "failed_run"
                    ? `run:${entry.item.run.id}`
                    : `join:${entry.item.joinRequest.id}`;
                return (
                  <AlertRow
                    key={key}
                    item={entry.item}
                    context={entry.context}
                    unreadState={entry.unreadState}
                    onOpen={entry.onOpen}
                    onApprove={entry.onApprove}
                    onReview={entry.onReview}
                    onSuspend={entry.onSuspend}
                    onBlock={entry.onBlock}
                    onRetry={entry.onRetry}
                    isPending={entry.isPending}
                    isRetrying={entry.isRetrying}
                    fallbackHref={entry.fallbackHref}
                    issueById={issueById}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FOOTER */}
      {!collapsed && (
        <div className="border-t border-border bg-muted/20">
          {!composerOpen ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Send className="h-3 w-3" />
                {t("inbox.writeToLead")}
              </button>
              {unreadCount > 0 && (
                <span className="text-[10px] font-medium text-muted-foreground">
                  {unreadCount === 1
                    ? t("inbox.unreadCountOne", { count: unreadCount })
                    : t("inbox.unreadCountMany", { count: unreadCount })}
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2 px-3 py-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleComposerKey}
                placeholder={t("inbox.writeToLeadPlaceholder")}
                rows={2}
                autoFocus
                className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setComposerOpen(false);
                    setDraft("");
                  }}
                >
                  Annulla
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  disabled={!draft.trim()}
                  onClick={handleSend}
                >
                  <Send className="mr-1 h-3 w-3" />
                  {t("inbox.send")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Helper for the projects view: resolve context + wire actions per item. */
export function buildProjectCardItem({
  item,
  agentById,
  issueById,
  projectById,
  fallbackHref,
  onApprove,
  onReview,
  onSuspend,
  onBlock,
  onRetry,
  onArchive,
  isPending,
  isRetrying,
  unreadState,
}: {
  item: InboxWorkItem;
  agentById: Map<string, Agent>;
  issueById: Map<string, Issue>;
  projectById: Map<string, Project>;
  fallbackHref?: string;
  onApprove?: () => void;
  onReview?: () => void;
  onSuspend?: () => void;
  onBlock?: () => void;
  onRetry?: () => void;
  onArchive?: () => void;
  isPending?: boolean;
  isRetrying?: boolean;
  unreadState: AlertUnreadState;
}): ProjectInboxCardItem {
  return {
    item,
    context: resolveItemContext(item, agentById, issueById, projectById),
    unreadState,
    onApprove,
    onReview,
    onSuspend,
    onBlock,
    onRetry,
    onArchive,
    isPending,
    isRetrying,
    fallbackHref,
  };
}
