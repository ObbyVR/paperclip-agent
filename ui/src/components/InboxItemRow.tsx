import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { cn } from "../lib/utils";
import { StatusIcon } from "./StatusIcon";
import { StatusBadge } from "./StatusBadge";
import { CategoryBadge } from "./CategoryBadge";
import { ProjectContextPill } from "./ProjectContextPill";
import { approvalLabel, defaultTypeIcon, typeIcon } from "./ApprovalPayload";
import { timeAgo } from "../lib/timeAgo";
import { Button } from "@/components/ui/button";
import {
  X,
  XCircle,
  RotateCcw,
  UserPlus,
} from "lucide-react";
import type { Approval, HeartbeatRun, Issue, JoinRequest } from "@paperclipai/shared";
import type { InboxWorkItem, InboxItemContext } from "../lib/inbox";
import { ACTIONABLE_APPROVAL_STATUSES } from "../lib/inbox";

type UnreadState = "visible" | "fading" | "hidden" | null;

interface InboxItemRowProps {
  item: InboxWorkItem;
  context: InboxItemContext;
  issueLinkState?: unknown;
  // Unread
  unreadState?: UnreadState;
  onMarkRead?: () => void;
  // Archive
  onArchive?: () => void;
  archiveDisabled?: boolean;
  // Actions (approval / join request)
  onApprove?: () => void;
  onReject?: () => void;
  // Actions (failed run)
  onRetry?: () => void;
  onDismiss?: () => void;
  isPending?: boolean;
  isRetrying?: boolean;
  // Issue lookup for failed runs
  issueById?: Map<string, Issue>;
  className?: string;
}

function UnreadSlot({
  unreadState,
  onMarkRead,
  onArchive,
  archiveDisabled,
}: {
  unreadState: UnreadState;
  onMarkRead?: () => void;
  onArchive?: () => void;
  archiveDisabled?: boolean;
}) {
  if (unreadState === null) return null;
  const showDot = unreadState === "visible" || unreadState === "fading";

  return (
    <span className="hidden sm:inline-flex h-4 w-4 shrink-0 items-center justify-center self-center">
      {showDot ? (
        <button
          type="button"
          onClick={onMarkRead}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-blue-500/20"
          aria-label="Mark as read"
        >
          <span className={cn(
            "block h-2 w-2 rounded-full bg-blue-600 transition-opacity duration-300 dark:bg-blue-400",
            unreadState === "fading" ? "opacity-0" : "opacity-100",
          )} />
        </button>
      ) : onArchive ? (
        <button
          type="button"
          onClick={onArchive}
          disabled={archiveDisabled}
          className="inline-flex h-4 w-4 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-30"
          aria-label="Dismiss from inbox"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="inline-flex h-4 w-4" aria-hidden="true" />
      )}
    </span>
  );
}

/** Agent identity: icon/name/role */
function AgentMeta({ context }: { context: InboxItemContext }) {
  if (!context.agentName) return null;
  // Don't show role if the agent name already contains it (e.g. "Marco — CEO")
  const nameIncludesRole = context.agentRole
    ? context.agentName.toLowerCase().includes(context.agentRole.toLowerCase())
    : true;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
      {context.agentIcon ? (
        <span className="text-sm leading-none">{context.agentIcon}</span>
      ) : null}
      <span className="font-medium text-foreground/80">{context.agentName}</span>
      {context.agentRole && !nameIncludesRole ? (
        <span className="hidden sm:inline text-muted-foreground/70">{context.agentRole}</span>
      ) : null}
    </span>
  );
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

function firstNonEmptyLine(value: string | null | undefined): string | null {
  if (!value) return null;
  const line = value.split("\n").map((chunk) => chunk.trim()).find(Boolean);
  return line ?? null;
}

// ── Render per kind ──────────────────────────────────────────────────

function IssueContent({ issue, issueLinkState }: { issue: Issue; issueLinkState?: unknown }) {
  const issuePathId = issue.identifier ?? issue.id;
  const identifier = issue.identifier ?? issue.id.slice(0, 8);
  return (
    <Link
      to={`/issues/${issuePathId}`}
      state={issueLinkState}
      className="flex min-w-0 flex-1 items-start gap-2 no-underline text-inherit transition-colors hover:bg-accent/50"
    >
      <span className="hidden shrink-0 sm:inline-flex">
        <StatusIcon status={issue.status} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium sm:truncate sm:line-clamp-none">
          <span className="font-mono text-muted-foreground mr-1.5">{identifier}</span>
          {issue.title}
        </span>
      </span>
    </Link>
  );
}

function ApprovalContent({ approval }: { approval: Approval }) {
  const Icon = typeIcon[approval.type] ?? defaultTypeIcon;
  const label = approvalLabel(approval.type, approval.payload as Record<string, unknown> | null);
  return (
    <Link
      to={`/approvals/${approval.id}`}
      className="flex min-w-0 flex-1 items-start gap-2 no-underline text-inherit transition-colors hover:bg-accent/50"
    >
      <span className="mt-0.5 shrink-0 rounded-md bg-muted p-1.5 sm:mt-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium sm:truncate sm:line-clamp-none">
          {label}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="capitalize">{approval.status.replaceAll("_", " ")}</span>
        </span>
      </span>
    </Link>
  );
}

function FailedRunContent({
  run,
  linkedAgentName,
  issue,
}: {
  run: HeartbeatRun;
  linkedAgentName: string | null;
  issue: Issue | null;
}) {
  const displayError = firstNonEmptyLine(run.error) ?? firstNonEmptyLine(run.stderrExcerpt) ?? "Run exited with an error.";
  return (
    <Link
      to={`/agents/${run.agentId}/runs/${run.id}`}
      className="flex min-w-0 flex-1 items-start gap-2 no-underline text-inherit transition-colors hover:bg-accent/50"
    >
      <span className="mt-0.5 shrink-0 rounded-md bg-red-500/20 p-1.5 sm:mt-0">
        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium sm:truncate sm:line-clamp-none">
          {issue ? (
            <>
              <span className="font-mono text-muted-foreground mr-1.5">
                {issue.identifier ?? issue.id.slice(0, 8)}
              </span>
              {issue.title}
            </>
          ) : (
            <>Failed run{linkedAgentName ? ` — ${linkedAgentName}` : ""}</>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <StatusBadge status={run.status} />
          <span className="truncate max-w-[250px]">{displayError}</span>
        </span>
      </span>
    </Link>
  );
}

function JoinRequestContent({ joinRequest }: { joinRequest: JoinRequest }) {
  const label =
    joinRequest.requestType === "human"
      ? "Human join request"
      : `Agent join request${joinRequest.agentName ? `: ${joinRequest.agentName}` : ""}`;
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <span className="mt-0.5 shrink-0 rounded-md bg-muted p-1.5 sm:mt-0">
        <UserPlus className="h-4 w-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium sm:truncate sm:line-clamp-none">
          {label}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{timeAgo(joinRequest.createdAt)}</span>
          {joinRequest.adapterType && <span>adapter: {joinRequest.adapterType}</span>}
        </span>
      </span>
    </div>
  );
}

// ── Action buttons ───────────────────────────────────────────────────

function ApproveRejectButtons({
  onApprove,
  onReject,
  isPending,
}: {
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Button
        size="sm"
        className="h-8 bg-green-700 px-3 text-white hover:bg-green-600"
        onClick={onApprove}
        disabled={isPending}
      >
        {t("inbox.approve")}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        className="h-8 px-3"
        onClick={onReject}
        disabled={isPending}
      >
        {t("inbox.reject")}
      </Button>
    </>
  );
}

function RetryButton({
  onRetry,
  isRetrying,
}: {
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 shrink-0 px-2.5"
      onClick={onRetry}
      disabled={isRetrying}
    >
      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
      {isRetrying ? t("inbox.retrying") : t("inbox.retry")}
    </Button>
  );
}

// ── Main component ───────────────────────────────────────────────────

export function InboxItemRow({
  item,
  context,
  issueLinkState,
  unreadState = null,
  onMarkRead,
  onArchive,
  archiveDisabled,
  onApprove,
  onReject,
  onRetry,
  onDismiss,
  isPending = false,
  isRetrying = false,
  issueById,
  className,
}: InboxItemRowProps) {
  // Resolve content + actions per kind
  let content: React.ReactNode = null;
  let actions: React.ReactNode = null;
  let timestamp: string | Date | null = null;

  if (item.kind === "issue") {
    content = <IssueContent issue={item.issue} issueLinkState={issueLinkState} />;
    timestamp = item.issue.updatedAt;
  } else if (item.kind === "approval") {
    content = <ApprovalContent approval={item.approval} />;
    timestamp = item.approval.updatedAt;
    const showActions =
      item.approval.type !== "budget_override_required" &&
      ACTIONABLE_APPROVAL_STATUSES.has(item.approval.status) &&
      onApprove && onReject;
    if (showActions) {
      actions = <ApproveRejectButtons onApprove={onApprove} onReject={onReject} isPending={isPending} />;
    }
  } else if (item.kind === "failed_run") {
    const issueId = readIssueIdFromRun(item.run);
    const issue = issueId && issueById ? issueById.get(issueId) ?? null : null;
    content = <FailedRunContent run={item.run} linkedAgentName={context.agentName} issue={issue} />;
    timestamp = item.run.createdAt;
    if (onRetry) {
      actions = <RetryButton onRetry={onRetry} isRetrying={isRetrying} />;
    }
  } else if (item.kind === "join_request") {
    content = <JoinRequestContent joinRequest={item.joinRequest} />;
    timestamp = item.joinRequest.createdAt;
    if (onApprove && onReject) {
      actions = <ApproveRejectButtons onApprove={onApprove} onReject={onReject} isPending={isPending} />;
    }
  }

  return (
    <div className={cn(
      "group border-b border-border px-2 py-2.5 last:border-b-0 sm:px-1 sm:pr-3 sm:py-2",
      className,
    )}>
      {/* ── Row: unread + badge + content + agent/time + actions ── */}
      <div className="flex items-start gap-2 sm:items-center">
        <UnreadSlot
          unreadState={unreadState}
          onMarkRead={onMarkRead}
          onArchive={onArchive}
          archiveDisabled={archiveDisabled}
        />

        {/* Category badge */}
        <CategoryBadge category={context.category} className="shrink-0" />

        {/* Main content (title only, meta goes below) */}
        <div className="min-w-0 flex-1">
          {content}
          {/* Project + task identifier + agent — small text below title */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <ProjectContextPill projectName={context.projectName} projectId={context.projectId} />
            {context.issueIdentifier && (
              <span className="font-mono text-[10px]">{context.issueIdentifier}</span>
            )}
            <AgentMeta context={context} />
          </div>
        </div>

        {/* Time — right side */}
        {timestamp && (
          <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {timeAgo(timestamp)}
          </span>
        )}

        {/* Desktop actions */}
        {actions && (
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            {actions}
          </div>
        )}

        {/* Dismiss button */}
        {!unreadState && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="hidden sm:inline-flex rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Mobile time + actions ── */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
        {timestamp && (
          <span className="text-xs text-muted-foreground">{timeAgo(timestamp)}</span>
        )}
      </div>
      {actions && (
        <div className="mt-2 flex gap-2 sm:hidden">
          {actions}
        </div>
      )}
    </div>
  );
}
