import { useTranslation } from "react-i18next";
import { TabsContent } from "@/components/ui/tabs";
import { Identity } from "./Identity";
import { relativeTime, formatTokens } from "../lib/utils";
import { modelLabel, formatEur } from "../lib/modelPricing";
import type { ActivityEvent, Agent } from "@paperclipai/shared";

const ACTION_LABELS: Record<string, string> = {
  "issue.created": "created the issue",
  "issue.updated": "updated the issue",
  "issue.checked_out": "checked out the issue",
  "issue.released": "released the issue",
  "issue.comment_added": "added a comment",
  "issue.attachment_added": "added an attachment",
  "issue.attachment_removed": "removed an attachment",
  "issue.document_created": "created a document",
  "issue.document_updated": "updated a document",
  "issue.document_deleted": "deleted a document",
  "issue.deleted": "deleted the issue",
  "agent.created": "created an agent",
  "agent.updated": "updated the agent",
  "agent.paused": "paused the agent",
  "agent.resumed": "resumed the agent",
  "agent.terminated": "terminated the agent",
  "heartbeat.invoked": "invoked a heartbeat",
  "heartbeat.cancelled": "cancelled a heartbeat",
  "approval.created": "requested approval",
  "approval.approved": "approved",
  "approval.rejected": "rejected",
};

function humanizeValue(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "none");
  return value.replace(/_/g, " ");
}

function formatAction(action: string, details?: Record<string, unknown> | null): string {
  if (action === "issue.updated" && details) {
    const previous = (details._previous ?? {}) as Record<string, unknown>;
    const parts: string[] = [];

    if (details.status !== undefined) {
      const from = previous.status;
      parts.push(
        from
          ? `changed the status from ${humanizeValue(from)} to ${humanizeValue(details.status)}`
          : `changed the status to ${humanizeValue(details.status)}`
      );
    }
    if (details.priority !== undefined) {
      const from = previous.priority;
      parts.push(
        from
          ? `changed the priority from ${humanizeValue(from)} to ${humanizeValue(details.priority)}`
          : `changed the priority to ${humanizeValue(details.priority)}`
      );
    }
    if (details.assigneeAgentId !== undefined || details.assigneeUserId !== undefined) {
      parts.push(
        details.assigneeAgentId || details.assigneeUserId
          ? "assigned the issue"
          : "unassigned the issue",
      );
    }
    if (details.title !== undefined) parts.push("updated the title");
    if (details.description !== undefined) parts.push("updated the description");

    if (parts.length > 0) return parts.join(", ");
  }
  if (
    (action === "issue.document_created" || action === "issue.document_updated" || action === "issue.document_deleted") &&
    details
  ) {
    const key = typeof details.key === "string" ? details.key : "document";
    const title = typeof details.title === "string" && details.title ? ` (${details.title})` : "";
    return `${ACTION_LABELS[action] ?? action} ${key}${title}`;
  }
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");
}

function ActorIdentity({ evt, agentMap }: { evt: ActivityEvent; agentMap: Map<string, Agent> }) {
  const id = evt.actorId;
  if (evt.actorType === "agent") {
    const agent = agentMap.get(id);
    return <Identity name={agent?.name ?? id.slice(0, 8)} size="sm" />;
  }
  if (evt.actorType === "system") return <Identity name="System" size="sm" />;
  if (evt.actorType === "user") return <Identity name="Board" size="sm" />;
  return <Identity name={id || "Unknown"} size="sm" />;
}

type IssueCostSummary = {
  hasCost: boolean;
  hasTokens: boolean;
  cost: number;
  totalTokens: number;
  input: number;
  output: number;
  cached: number;
  estimatedEur: number | null;
  models: string[];
};

type Props = {
  activity: ActivityEvent[] | undefined;
  hasLinkedRuns: boolean;
  issueCostSummary: IssueCostSummary;
  agentMap: Map<string, Agent>;
};

export function IssueActivityTab({ activity, hasLinkedRuns, issueCostSummary, agentMap }: Props) {
  const { t } = useTranslation();

  return (
    <TabsContent value="activity">
      {hasLinkedRuns && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-medium text-muted-foreground">{t("issueDetail.costSummary")}</div>
            {issueCostSummary.models.length > 0 && (
              <div className="flex gap-1">
                {issueCostSummary.models.map((m) => (
                  <span key={m} className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    {modelLabel(m)}
                  </span>
                ))}
              </div>
            )}
          </div>
          {!issueCostSummary.hasCost && !issueCostSummary.hasTokens ? (
            <div className="text-xs text-muted-foreground">{t("issueDetail.noCostData")}</div>
          ) : (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground tabular-nums">
              {issueCostSummary.hasCost && (
                <span className="font-medium text-foreground">
                  ${issueCostSummary.cost.toFixed(4)}
                </span>
              )}
              {!issueCostSummary.hasCost && issueCostSummary.estimatedEur !== null && (
                <span className="font-medium text-foreground" title="Stima equivalente costo API">
                  ~{formatEur(issueCostSummary.estimatedEur)}
                </span>
              )}
              {issueCostSummary.hasTokens && (
                <span>
                  Tokens {formatTokens(issueCostSummary.totalTokens)}
                  {issueCostSummary.cached > 0
                    ? ` (in ${formatTokens(issueCostSummary.input)}, out ${formatTokens(issueCostSummary.output)}, cached ${formatTokens(issueCostSummary.cached)})`
                    : ` (in ${formatTokens(issueCostSummary.input)}, out ${formatTokens(issueCostSummary.output)})`}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {!activity || activity.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("issueDetail.noActivity")}</p>
      ) : (
        <div className="space-y-1.5">
          {activity.slice(0, 20).map((evt) => (
            <div key={evt.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ActorIdentity evt={evt} agentMap={agentMap} />
              <span>{formatAction(evt.action, evt.details)}</span>
              <span className="ml-auto shrink-0">{relativeTime(evt.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </TabsContent>
  );
}
