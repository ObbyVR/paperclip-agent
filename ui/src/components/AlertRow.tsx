import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { cn } from "../lib/utils";
import { timeAgo } from "../lib/timeAgo";
import {
  Check,
  Eye,
  PauseCircle,
  Ban,
  RotateCcw,
  XCircle,
  UserPlus,
  Bell,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import type { Approval, HeartbeatRun, Issue, JoinRequest } from "@paperclipai/shared";
import type {
  InboxWorkItem,
  InboxItemContext,
  InboxItemCategory,
} from "../lib/inbox";
import { ACTIONABLE_APPROVAL_STATUSES } from "../lib/inbox";
import { approvalLabel, defaultTypeIcon, typeIcon } from "./ApprovalPayload";

/**
 * AlertRow — the redesigned single alert row inside a ProjectInboxCard.
 *
 * Principles (vs the old InboxItemRow):
 * - No colored dots. The type label (RICHIESTA / MESSAGGIO / AGGIORNAMENTO)
 *   sits ABOVE the title in its own color — it IS the legend.
 * - Time in a small left column, following the email/Slack convention.
 * - Unread state = stronger bg + left border accent; single mount pulse, no loops.
 * - Actions appear inline on hover (approve / review / suspend / block).
 * - No navigation from the row itself — the whole row is a button that calls
 *   onOpen(). The drawer (S41) will be the target; for S40 onOpen falls back
 *   to the legacy navigate-to-detail behavior passed by the parent.
 */

type UnreadState = "new" | "actionable" | "read";

const CATEGORY_COLORS: Record<
  InboxItemCategory,
  {
    label: string;
    text: string;
    border: string;
    bgSoft: string;
  }
> = {
  richiesta: {
    label: "RICHIESTA",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-l-amber-500",
    bgSoft: "bg-amber-500/5 dark:bg-amber-500/10",
  },
  messaggio: {
    label: "MESSAGGIO",
    text: "text-sky-600 dark:text-sky-400",
    border: "border-l-sky-500",
    bgSoft: "bg-sky-500/5 dark:bg-sky-500/10",
  },
  aggiornamento: {
    label: "AGGIORNAMENTO",
    text: "text-violet-600 dark:text-violet-400",
    border: "border-l-violet-500",
    bgSoft: "bg-violet-500/5 dark:bg-violet-500/10",
  },
};

/** Map-ready list for the static legend (projects view toolbar). */
export const ALERT_CATEGORY_LEGEND: Array<{
  category: InboxItemCategory;
  label: string;
  textClass: string;
  Icon: typeof Bell;
}> = [
  { category: "richiesta", label: "Richiesta", textClass: CATEGORY_COLORS.richiesta.text, Icon: Bell },
  { category: "messaggio", label: "Messaggio", textClass: CATEGORY_COLORS.messaggio.text, Icon: MessageSquare },
  { category: "aggiornamento", label: "Aggiornamento", textClass: CATEGORY_COLORS.aggiornamento.text, Icon: RefreshCw },
];

function firstLine(value: string | null | undefined): string {
  if (!value) return "";
  return value.split("\n").map((x) => x.trim()).find(Boolean) ?? "";
}

function readIssueIdFromRun(run: HeartbeatRun): string | null {
  const ctx = run.contextSnapshot;
  if (!ctx) return null;
  const issueId = ctx["issueId"];
  if (typeof issueId === "string" && issueId.length > 0) return issueId;
  const taskId = ctx["taskId"];
  if (typeof taskId === "string" && taskId.length > 0) return taskId;
  return null;
}

interface AlertRowProps {
  item: InboxWorkItem;
  context: InboxItemContext;
  unreadState: UnreadState;
  // Actions — all optional. Parent decides which ones apply.
  onOpen?: () => void;
  onApprove?: () => void;
  onReview?: () => void;
  onSuspend?: () => void; // placeholder for S42 — disabled with tooltip
  onBlock?: () => void;
  onRetry?: () => void;
  isPending?: boolean;
  isRetrying?: boolean;
  // Fallback Link target when onOpen is not provided (S40 default).
  fallbackHref?: string;
  issueById?: Map<string, Issue>;
  className?: string;
}

/** Short semantic title extracted from each work-item kind. */
function resolveTitle(item: InboxWorkItem, issueById?: Map<string, Issue>): {
  title: string;
  identifier: string | null;
} {
  if (item.kind === "issue") {
    return {
      title: item.issue.title,
      identifier: item.issue.identifier ?? item.issue.id.slice(0, 8),
    };
  }
  if (item.kind === "approval") {
    const label = approvalLabel(
      item.approval.type,
      item.approval.payload as Record<string, unknown> | null,
    );
    return { title: label, identifier: null };
  }
  if (item.kind === "failed_run") {
    const issueId = readIssueIdFromRun(item.run);
    const issue = issueId && issueById ? issueById.get(issueId) ?? null : null;
    if (issue) {
      return {
        title: issue.title,
        identifier: issue.identifier ?? issue.id.slice(0, 8),
      };
    }
    const err = firstLine(item.run.error) || firstLine(item.run.stderrExcerpt) || "Run failed";
    return { title: err, identifier: null };
  }
  // join_request
  const jr = item.joinRequest;
  return {
    title:
      jr.requestType === "human"
        ? "Richiesta di accesso utente"
        : `Richiesta join agente${jr.agentName ? `: ${jr.agentName}` : ""}`,
    identifier: null,
  };
}

function resolveTimestamp(item: InboxWorkItem): Date | string | null {
  if (item.kind === "issue") return item.issue.updatedAt;
  if (item.kind === "approval") return item.approval.updatedAt;
  if (item.kind === "failed_run") return item.run.createdAt;
  return item.joinRequest.createdAt;
}

function KindIcon({ item }: { item: InboxWorkItem }) {
  if (item.kind === "approval") {
    const Icon = typeIcon[item.approval.type] ?? defaultTypeIcon;
    return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
  if (item.kind === "failed_run") {
    return <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />;
  }
  if (item.kind === "join_request") {
    return <UserPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
  return null;
}

export function AlertRow({
  item,
  context,
  unreadState,
  onOpen,
  onApprove,
  onReview,
  onSuspend,
  onBlock,
  onRetry,
  isPending = false,
  isRetrying = false,
  fallbackHref,
  issueById,
  className,
}: AlertRowProps) {
  const { t } = useTranslation();
  const category = CATEGORY_COLORS[context.category];
  const { title } = resolveTitle(item, issueById);
  const timestamp = resolveTimestamp(item);
  const isRead = unreadState === "read";
  const isActionable = unreadState === "actionable";

  // Approval action surfacing (only actionable approvals show quick buttons)
  const hasApprovalActions =
    item.kind === "approval" &&
    item.approval.type !== "budget_override_required" &&
    ACTIONABLE_APPROVAL_STATUSES.has(item.approval.status) &&
    !!onApprove;

  const hasRetry = item.kind === "failed_run" && !!onRetry;

  const innerClass = "flex w-full items-start gap-3 px-3 py-2 text-left no-underline text-inherit";
  const innerContent = (
    <>
      {/* Left column: time */}
      <span className="w-10 shrink-0 pt-0.5 text-[10px] leading-tight text-muted-foreground tabular-nums">
        {timestamp ? timeAgo(timestamp) : ""}
      </span>

      {/* Main column */}
      <span className="min-w-0 flex-1">
        {/* Type label (colored, above title) + kind icon + requester */}
        <span className="mb-0.5 flex items-center gap-1.5">
          <KindIcon item={item} />
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider",
              category.text,
            )}
          >
            {category.label}
          </span>
          {context.agentName && (
            <span className="truncate text-[10px] text-muted-foreground">
              {" · "}
              {context.agentIcon ? <span className="mr-0.5">{context.agentIcon}</span> : null}
              {context.agentName}
            </span>
          )}
        </span>
        {/* Title row — identifier intentionally omitted: project context is
            already provided by the parent card header, and the visible title
            is enough for recognition. */}
        <span className="block truncate text-[13px] font-medium text-foreground">
          {title}
        </span>
      </span>
    </>
  );

  return (
    <div
      className={cn(
        "group/alert relative border-l-2 transition-colors",
        isRead
          ? "border-l-transparent opacity-60 hover:opacity-90"
          : isActionable
          ? cn(category.border, category.bgSoft, "ring-1 ring-inset ring-border/50")
          : cn(category.border, "bg-background"),
        "hover:bg-accent/40",
        className,
      )}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={innerClass}
          aria-label={t("inbox.openAlert")}
        >
          {innerContent}
        </button>
      ) : fallbackHref ? (
        <Link to={fallbackHref} className={innerClass} aria-label={t("inbox.openAlert")}>
          {innerContent}
        </Link>
      ) : (
        <div className={innerClass}>{innerContent}</div>
      )}

      {/* Hover actions — absolute so they overlay time/title without reflowing */}
      <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover/alert:pointer-events-auto group-hover/alert:opacity-100">
        {hasApprovalActions && (
          <button
            type="button"
            onClick={onApprove}
            disabled={isPending}
            title={t("inbox.approve")}
            className="rounded-md bg-background p-1.5 text-green-600 shadow-sm ring-1 ring-border hover:bg-green-500/10 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
        {(hasApprovalActions || item.kind === "issue") && onReview && (
          <button
            type="button"
            onClick={onReview}
            disabled={isPending}
            title={t("inbox.review")}
            className="rounded-md bg-background p-1.5 text-sky-600 shadow-sm ring-1 ring-border hover:bg-sky-500/10 disabled:opacity-50"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
        {onSuspend && (
          <button
            type="button"
            onClick={onSuspend}
            disabled={isPending}
            title={t("inbox.suspendTooltip")}
            className="rounded-md bg-background p-1.5 text-amber-600 shadow-sm ring-1 ring-border hover:bg-amber-500/10 disabled:opacity-50"
          >
            <PauseCircle className="h-3.5 w-3.5" />
          </button>
        )}
        {onBlock && (
          <button
            type="button"
            onClick={onBlock}
            disabled={isPending}
            title={t("inbox.block")}
            className="rounded-md bg-background p-1.5 text-red-600 shadow-sm ring-1 ring-border hover:bg-red-500/10 disabled:opacity-50"
          >
            <Ban className="h-3.5 w-3.5" />
          </button>
        )}
        {hasRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            title={t("inbox.retry")}
            className="rounded-md bg-background p-1.5 text-sky-600 shadow-sm ring-1 ring-border hover:bg-sky-500/10 disabled:opacity-50"
          >
            <RotateCcw className={cn("h-3.5 w-3.5", isRetrying && "animate-spin")} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Helper used by the projects view to compute unread state per item. */
export function computeAlertUnreadState(
  item: InboxWorkItem,
  readKeys: Set<string>,
  keyForItem: (item: InboxWorkItem) => string,
): UnreadState {
  const key = keyForItem(item);
  const actionable =
    item.kind === "approval" &&
    item.approval.type !== "budget_override_required" &&
    ACTIONABLE_APPROVAL_STATUSES.has(item.approval.status);
  if (readKeys.has(key)) return "read";
  if (actionable) return "actionable";
  if (item.kind === "issue" && item.issue.isUnreadForMe) return "new";
  if (item.kind === "failed_run") return "actionable";
  if (item.kind === "join_request") return "actionable";
  return "new";
}

export type { UnreadState as AlertUnreadState };
