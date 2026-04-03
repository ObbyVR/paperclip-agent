import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import type { IssueComment, Agent } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { ArrowDownUp, Check, Copy, Paperclip, SendHorizonal } from "lucide-react";
import { Identity } from "./Identity";
import { InlineEntitySelector, type InlineEntityOption } from "./InlineEntitySelector";
import { MarkdownBody } from "./MarkdownBody";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "./MarkdownEditor";
import { StatusBadge } from "./StatusBadge";
import { AgentIcon } from "./AgentIconPicker";
import { formatDateTime } from "../lib/utils";
import { PluginSlotOutlet } from "@/plugins/slots";
import { FileOutputLinks } from "./FileOutputLinks";

interface CommentWithRunMeta extends IssueComment {
  runId?: string | null;
  runAgentId?: string | null;
}

interface LinkedRunItem {
  runId: string;
  status: string;
  agentId: string;
  createdAt: Date | string;
  startedAt: Date | string | null;
}

interface CommentReassignment {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
}

interface CommentThreadProps {
  comments: CommentWithRunMeta[];
  linkedRuns?: LinkedRunItem[];
  companyId?: string | null;
  projectId?: string | null;
  onAdd: (body: string, reopen?: boolean, reassignment?: CommentReassignment) => Promise<void>;
  issueStatus?: string;
  agentMap?: Map<string, Agent>;
  imageUploadHandler?: (file: File) => Promise<string>;
  /** Callback to attach an image file to the parent issue (not inline in a comment). */
  onAttachImage?: (file: File) => Promise<void>;
  draftKey?: string;
  liveRunSlot?: React.ReactNode;
  enableReassign?: boolean;
  reassignOptions?: InlineEntityOption[];
  currentAssigneeValue?: string;
  suggestedAssigneeValue?: string;
  mentions?: MentionOption[];
  /** If set, shows a "wake up agent after send" toggle and calls this after a comment is posted. */
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  onWakeupAgent?: (agentId: string) => Promise<void>;
}

const DRAFT_DEBOUNCE_MS = 800;

function loadDraft(draftKey: string): string {
  try {
    return localStorage.getItem(draftKey) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(draftKey: string, value: string) {
  try {
    if (value.trim()) {
      localStorage.setItem(draftKey, value);
    } else {
      localStorage.removeItem(draftKey);
    }
  } catch {
    // Ignore localStorage failures.
  }
}

function clearDraft(draftKey: string) {
  try {
    localStorage.removeItem(draftKey);
  } catch {
    // Ignore localStorage failures.
  }
}

function parseReassignment(target: string): CommentReassignment | null {
  if (!target || target === "__none__") {
    return { assigneeAgentId: null, assigneeUserId: null };
  }
  if (target.startsWith("agent:")) {
    const assigneeAgentId = target.slice("agent:".length);
    return assigneeAgentId ? { assigneeAgentId, assigneeUserId: null } : null;
  }
  if (target.startsWith("user:")) {
    const assigneeUserId = target.slice("user:".length);
    return assigneeUserId ? { assigneeAgentId: null, assigneeUserId } : null;
  }
  return null;
}

function CopyMarkdownButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground transition-colors"
      title="Copy as markdown"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

type TimelineItem =
  | { kind: "comment"; id: string; createdAtMs: number; comment: CommentWithRunMeta }
  | { kind: "run"; id: string; createdAtMs: number; run: LinkedRunItem };

const TimelineList = memo(function TimelineList({
  timeline,
  agentMap,
  companyId,
  projectId,
  highlightCommentId,
}: {
  timeline: TimelineItem[];
  agentMap?: Map<string, Agent>;
  companyId?: string | null;
  projectId?: string | null;
  highlightCommentId?: string | null;
}) {
  const { t } = useTranslation();
  if (timeline.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("commentThread.empty")}</p>;
  }

  return (
    <div className="space-y-4">
      {timeline.map((item) => {
        if (item.kind === "run") {
          const run = item.run;
          return (
            <div key={`run:${run.runId}`} className="flex gap-3 items-start">
              <div className="shrink-0 pt-0.5">
                <div className="h-8 w-8 rounded-full bg-accent/60 flex items-center justify-center">
                  <span className="text-xs font-medium text-muted-foreground">⚡</span>
                </div>
              </div>
              <div className="flex-1 min-w-0 border border-border bg-accent/10 rounded-xl px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <Link to={`/agents/${run.agentId}`} className="hover:underline font-medium text-sm">
                    {agentMap?.get(run.agentId)?.name ?? run.agentId.slice(0, 8)}
                  </Link>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDateTime(run.startedAt ?? run.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Run</span>
                  <Link
                    to={`/agents/${run.agentId}/runs/${run.runId}`}
                    className="inline-flex items-center rounded-md border border-border bg-accent/40 px-2 py-1 font-mono text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                  >
                    {run.runId.slice(0, 8)}
                  </Link>
                  <StatusBadge status={run.status} />
                </div>
              </div>
            </div>
          );
        }

        const comment = item.comment;
        const isAgent = !!comment.authorAgentId;
        const isHighlighted = highlightCommentId === comment.id;
        const agentInfo = isAgent ? agentMap?.get(comment.authorAgentId!) : null;

        return (
          <div
            key={comment.id}
            id={`comment-${comment.id}`}
            className={`flex gap-3 items-start ${isAgent ? "" : "flex-row-reverse"}`}
          >
            <div className="shrink-0 pt-0.5">
              {isAgent ? (
                <Link to={`/agents/${comment.authorAgentId}`}>
                  <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center" title={agentInfo?.name ?? "Agent"}>
                    <span className="text-xs font-bold text-primary">
                      {(agentInfo?.name ?? "A").charAt(0).toUpperCase()}
                    </span>
                  </div>
                </Link>
              ) : (
                <div className="h-8 w-8 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center" title={t("commentThread.you")}>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Y</span>
                </div>
              )}
            </div>
            <div
              className={`flex-1 min-w-0 max-w-[85%] rounded-2xl px-4 py-3 shadow-sm transition-colors duration-1000 ${
                isHighlighted
                  ? "border-2 border-primary/50 bg-primary/5"
                  : isAgent
                    ? "bg-card border border-border"
                    : "bg-emerald-500/8 border border-emerald-500/20"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-sm">
                  {isAgent ? (
                    <Link to={`/agents/${comment.authorAgentId}`} className="hover:underline text-foreground">
                      {agentInfo?.name ?? comment.authorAgentId!.slice(0, 8)}
                    </Link>
                  ) : (
                    <span className="text-emerald-700 dark:text-emerald-400">{t("commentThread.you")}</span>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  {companyId ? (
                    <PluginSlotOutlet
                      slotTypes={["commentContextMenuItem"]}
                      entityType="comment"
                      context={{
                        companyId,
                        projectId: projectId ?? null,
                        entityId: comment.id,
                        entityType: "comment",
                        parentEntityId: comment.issueId,
                      }}
                      className="flex flex-wrap items-center gap-1.5"
                      itemClassName="inline-flex"
                      missingBehavior="placeholder"
                    />
                  ) : null}
                  <a
                    href={`#comment-${comment.id}`}
                    className="text-[11px] text-muted-foreground hover:text-foreground hover:underline transition-colors"
                  >
                    {formatDateTime(comment.createdAt)}
                  </a>
                  <CopyMarkdownButton text={comment.body} />
                </span>
              </div>
              <MarkdownBody className="text-sm">{comment.body}</MarkdownBody>
              <FileOutputLinks content={comment.body} />
              {companyId ? (
                <div className="mt-2 space-y-2">
                  <PluginSlotOutlet
                    slotTypes={["commentAnnotation"]}
                    entityType="comment"
                    context={{
                      companyId,
                      projectId: projectId ?? null,
                      entityId: comment.id,
                      entityType: "comment",
                      parentEntityId: comment.issueId,
                    }}
                    className="space-y-2"
                    itemClassName="rounded-md"
                    missingBehavior="placeholder"
                  />
                </div>
              ) : null}
              {comment.runId && (
                <div className="mt-2 pt-2 border-t border-border/40">
                  {comment.runAgentId ? (
                    <Link
                      to={`/agents/${comment.runAgentId}/runs/${comment.runId}`}
                      className="inline-flex items-center rounded-md border border-border bg-accent/30 px-2 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                    >
                      run {comment.runId.slice(0, 8)}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center rounded-md border border-border bg-accent/30 px-2 py-1 text-[10px] font-mono text-muted-foreground">
                      run {comment.runId.slice(0, 8)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export function CommentThread({
  comments,
  linkedRuns = [],
  companyId,
  projectId,
  onAdd,
  agentMap,
  imageUploadHandler,
  onAttachImage,
  draftKey,
  liveRunSlot,
  enableReassign = false,
  reassignOptions = [],
  currentAssigneeValue = "",
  suggestedAssigneeValue,
  mentions: providedMentions,
  assignedAgentId,
  assignedAgentName,
  onWakeupAgent,
}: CommentThreadProps) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [reopen, setReopen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [wakeupAfterSend, setWakeupAfterSend] = useState(true);
  const [wokenUp, setWokenUp] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const effectiveSuggestedAssigneeValue = suggestedAssigneeValue ?? currentAssigneeValue;
  const [reassignTarget, setReassignTarget] = useState(effectiveSuggestedAssigneeValue);
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MarkdownEditorRef>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const hasScrolledRef = useRef(false);

  const timeline = useMemo<TimelineItem[]>(() => {
    const commentItems: TimelineItem[] = comments.map((comment) => ({
      kind: "comment",
      id: comment.id,
      createdAtMs: new Date(comment.createdAt).getTime(),
      comment,
    }));
    const runItems: TimelineItem[] = linkedRuns.map((run) => ({
      kind: "run",
      id: run.runId,
      createdAtMs: new Date(run.startedAt ?? run.createdAt).getTime(),
      run,
    }));
    const sorted = [...commentItems, ...runItems].sort((a, b) => {
      if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
      if (a.kind === b.kind) return a.id.localeCompare(b.id);
      return a.kind === "comment" ? -1 : 1;
    });
    return sortNewestFirst ? sorted.reverse() : sorted;
  }, [comments, linkedRuns, sortNewestFirst]);

  // Build mention options from agent map (exclude terminated agents)
  const mentions = useMemo<MentionOption[]>(() => {
    if (providedMentions) return providedMentions;
    if (!agentMap) return [];
    return Array.from(agentMap.values())
      .filter((a) => a.status !== "terminated")
      .map((a) => ({
        id: `agent:${a.id}`,
        name: a.name,
        kind: "agent",
        agentId: a.id,
        agentIcon: a.icon,
      }));
  }, [agentMap, providedMentions]);

  useEffect(() => {
    if (!draftKey) return;
    setBody(loadDraft(draftKey));
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveDraft(draftKey, body);
    }, DRAFT_DEBOUNCE_MS);
  }, [body, draftKey]);

  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);

  useEffect(() => {
    setReassignTarget(effectiveSuggestedAssigneeValue);
  }, [effectiveSuggestedAssigneeValue]);

  // Auto-scroll to latest message when timeline changes (only when sorting oldest-first)
  useEffect(() => {
    if (sortNewestFirst) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline.length, sortNewestFirst]);

  // Scroll to comment when URL hash matches #comment-{id}
  useEffect(() => {
    const hash = location.hash;
    if (!hash.startsWith("#comment-") || comments.length === 0) return;
    const commentId = hash.slice("#comment-".length);
    // Only scroll once per hash
    if (hasScrolledRef.current) return;
    const el = document.getElementById(`comment-${commentId}`);
    if (el) {
      hasScrolledRef.current = true;
      setHighlightCommentId(commentId);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Clear highlight after animation
      const timer = setTimeout(() => setHighlightCommentId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [location.hash, comments]);

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    const hasReassignment = enableReassign && reassignTarget !== currentAssigneeValue;
    const reassignment = hasReassignment ? parseReassignment(reassignTarget) : null;

    setSubmitting(true);
    try {
      await onAdd(trimmed, reopen ? true : undefined, reassignment ?? undefined);
      setBody("");
      if (draftKey) clearDraft(draftKey);
      setReopen(true);
      setReassignTarget(effectiveSuggestedAssigneeValue);
      if (wakeupAfterSend && assignedAgentId && onWakeupAgent) {
        try {
          await onWakeupAgent(assignedAgentId);
          setWokenUp(true);
          setTimeout(() => setWokenUp(false), 3000);
        } catch { /* non-critical */ }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAttachFile(evt: ChangeEvent<HTMLInputElement>) {
    const file = evt.target.files?.[0];
    if (!file) return;
    setAttaching(true);
    try {
      if (imageUploadHandler) {
        const url = await imageUploadHandler(file);
        const safeName = file.name.replace(/[[\]]/g, "\\$&");
        const markdown = `![${safeName}](${url})`;
        setBody((prev) => prev ? `${prev}\n\n${markdown}` : markdown);
      } else if (onAttachImage) {
        await onAttachImage(file);
      }
    } finally {
      setAttaching(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  }

  const canSubmit = !submitting && !!body.trim();

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("commentThread.title")} ({timeline.length})</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground"
          onClick={() => setSortNewestFirst((p) => !p)}
        >
          <ArrowDownUp className="h-3 w-3" />
          {sortNewestFirst ? t("commentThread.newestFirst") : t("commentThread.oldestFirst")}
        </Button>
      </div>

      {/* Scrollable message list */}
      <div className="max-h-[480px] overflow-y-auto pr-1 space-y-4">
        <TimelineList
          timeline={timeline}
          agentMap={agentMap}
          companyId={companyId}
          projectId={projectId}
          highlightCommentId={highlightCommentId}
        />
        {liveRunSlot}
        <div ref={messagesEndRef} />
      </div>

      {/* Compact chat composer — always visible below messages */}
      <div className="sticky bottom-0 bg-background pt-2">
        <div className="rounded-xl border border-border bg-muted/30 focus-within:border-primary/50 focus-within:bg-background transition-colors">
          <MarkdownEditor
            ref={editorRef}
            value={body}
            onChange={setBody}
            placeholder={t("commentThread.placeholder")}
            mentions={mentions}
            onSubmit={handleSubmit}
            imageUploadHandler={imageUploadHandler}
            contentClassName="min-h-[44px] max-h-[160px] text-sm px-1"
          />
          <div className="flex items-center gap-2 px-3 pb-2 pt-1">
            {/* Left: attach */}
            {(imageUploadHandler || onAttachImage) && (
              <>
                <input
                  ref={attachInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAttachFile}
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => attachInputRef.current?.click()}
                  disabled={attaching}
                  title={t("commentThread.attachImage")}
                  className="text-muted-foreground"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </Button>
              </>
            )}

            {/* Toggles */}
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={reopen}
                onChange={(e) => setReopen(e.target.checked)}
                className="rounded border-border h-3 w-3"
              />
              {t("commentThread.reopen")}
            </label>

            {assignedAgentId && onWakeupAgent && (
              <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={wakeupAfterSend}
                  onChange={(e) => setWakeupAfterSend(e.target.checked)}
                  className="rounded border-border h-3 w-3"
                />
                <span className={wakeupAfterSend ? "text-primary font-medium" : "text-muted-foreground"}>
                  {assignedAgentName
                    ? t("commentThread.wakeupAgent", { name: assignedAgentName })
                    : t("commentThread.wakeupAgentGeneric")}
                </span>
              </label>
            )}

            {enableReassign && reassignOptions.length > 0 && (
              <InlineEntitySelector
                value={reassignTarget}
                options={reassignOptions}
                placeholder={t("commentThread.assignee")}
                noneLabel={t("commentThread.noAssignee")}
                searchPlaceholder={t("commentThread.searchAssignees")}
                emptyMessage={t("commentThread.noAssigneesFound")}
                onChange={setReassignTarget}
                className="text-xs h-7"
                renderTriggerValue={(option) => {
                  if (!option) return <span className="text-muted-foreground">{t("commentThread.assignee")}</span>;
                  const agentId = option.id.startsWith("agent:") ? option.id.slice("agent:".length) : null;
                  const agent = agentId ? agentMap?.get(agentId) : null;
                  return (
                    <>
                      {agent ? <AgentIcon icon={agent.icon} className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
                      <span className="truncate">{option.label}</span>
                    </>
                  );
                }}
                renderOption={(option) => {
                  if (!option.id) return <span className="truncate">{option.label}</span>;
                  const agentId = option.id.startsWith("agent:") ? option.id.slice("agent:".length) : null;
                  const agent = agentId ? agentMap?.get(agentId) : null;
                  return (
                    <>
                      {agent ? <AgentIcon icon={agent.icon} className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
                      <span className="truncate">{option.label}</span>
                    </>
                  );
                }}
              />
            )}

            {/* Wakeup feedback */}
            {wokenUp && (
              <span className="text-xs text-primary font-medium animate-in fade-in duration-300">
                ⚡ {t("commentThread.woken")}
              </span>
            )}

            {/* Send button — right-aligned */}
            <Button
              size="icon-sm"
              className="ml-auto h-7 w-7 rounded-lg"
              disabled={!canSubmit}
              onClick={handleSubmit}
              title={submitting ? t("commentThread.posting") : t("commentThread.submit")}
            >
              <SendHorizonal className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
