import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { activityApi } from "../api/activity";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { timeAgo } from "../lib/timeAgo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Identity } from "./Identity";
import { MarkdownBody } from "./MarkdownBody";
import { StatusIcon } from "./StatusIcon";
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Maximize2,
  MessageSquare, RotateCcw, X, XCircle,
} from "lucide-react";
import type { Agent, Issue, IssueComment } from "@paperclipai/shared";
import { WorkspaceFileBrowser } from "./WorkspaceFileBrowser";

/* ── Types ────────────────────────────────── */

type Props = {
  issue: Issue;
  agents: Agent[];
  agentMap: Map<string, Agent>;
  comments: IssueComment[] | undefined;
  childIssues: Issue[];
  onApprove: (feedback?: string) => void;
  onReject: (feedback?: string) => void;
  onRevision: (feedback?: string) => void;
  isPending: boolean;
};

type AccordionSection = "output" | "commenti" | "subissues" | null;

/* ── Helpers ──────────────────────────────── */

function fixMarkdownBreaks(md: string): string {
  return md
    .replace(/(\*\*[^*]+:\*\*[^\n]*)\n(\*\*[^*]+:\*\*)/g, "$1\n\n$2")
    .replace(/([^\n])\n(\*\*[^*]+:\*\*)/g, "$1\n\n$2")
    .replace(/([^\n])\n(\* )/g, "$1\n\n$2");
}

function extractRunContent(run: { resultJson?: unknown; status: string }): string | null {
  if (run.status !== "succeeded" && run.status !== "completed") return null;
  const result = run.resultJson as Record<string, unknown> | null;
  if (!result) return null;
  if (typeof result.content === "string" && result.content.length > 0) return result.content;
  return null;
}

/** Extract first meaningful paragraph from markdown as a summary */
function extractSummary(md: string, maxLen = 300): string {
  const lines = md.split("\n");
  const paragraphs: string[] = [];
  let current = "";
  let inCodeBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    // Track code blocks
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      if (current.trim()) paragraphs.push(current.trim());
      current = "";
      continue;
    }
    if (inCodeBlock) continue;
    // Skip headings, horizontal rules, empty lines, table rows, table separators, list-style metadata
    if (
      trimmed.startsWith("#") ||
      trimmed === "---" ||
      trimmed === "" ||
      trimmed.startsWith("|") ||
      /^[-|:\s]+$/.test(trimmed) ||
      /^\*?\*?(Progetto|Stato|Issue|Token|Hex|Uso|Shadow|Nome|Tagline|Palette|Emozione|Tono)\*?\*?\s*[:|-]/.test(trimmed) ||
      /^[-*]\s+\*?\*?\w+\*?\*?\s*:/.test(trimmed)
    ) {
      if (current.trim()) paragraphs.push(current.trim());
      current = "";
      continue;
    }
    current += (current ? " " : "") + trimmed;
  }
  if (current.trim()) paragraphs.push(current.trim());

  // Find first paragraph that's actual prose (long enough, looks like a sentence)
  const summary = paragraphs.find(
    (p) => p.length > 40 && /[a-zA-ZàèéìòùÀÈÉÌÒÙ]{3,}/.test(p) && !/^[`{(\[]/.test(p),
  );
  if (!summary) return "";
  return summary.length > maxLen ? summary.slice(0, maxLen - 1) + "\u2026" : summary;
}

/* ── Accordion Tab Button ─────────────────── */

function SectionButton({
  label,
  isOpen,
  onClick,
  badge,
}: {
  label: string;
  isOpen: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 py-2.5 text-xs font-medium text-center transition-colors relative",
        "hover:bg-red-500/5",
        "border-r last:border-r-0 border-red-500/10",
        isOpen ? "text-red-400 bg-red-500/[0.06]" : "text-muted-foreground",
      )}
    >
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-1 text-[10px] text-muted-foreground">({badge})</span>
      )}
    </button>
  );
}

/* ── Section: Output (documents or run results) ── */

function SectionOutput({ issue }: { issue: Issue }) {
  const [showFull, setShowFull] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const { data: documents, isLoading } = useQuery({
    queryKey: queryKeys.issues.documents(issue.id),
    queryFn: () => issuesApi.listDocuments(issue.id),
    enabled: !!issue.id,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.issues.runs(issue.id),
    queryFn: () => activityApi.runsForIssue(issue.id),
    enabled: !!issue.id,
  });

  const runContent = useMemo(() => {
    if (!runs) return null;
    for (const run of runs.filter((r) => r.status === "succeeded" || r.status === "completed")) {
      const content = extractRunContent(run);
      if (content) return content;
    }
    return null;
  }, [runs]);

  if (isLoading) {
    return (
      <div className="px-4 py-4">
        <div className="animate-pulse bg-muted/30 rounded h-20" />
      </div>
    );
  }

  const doc = documents?.[0];
  if (doc) {
    const fixedBody = fixMarkdownBreaks(doc.body);
    const isLong = fixedBody.length > 3000;
    const displayBody = showFull || !isLong ? fixedBody : fixedBody.slice(0, 3000);

    // Resolve a human-readable document title
    const docDisplayTitle = doc.title
      ?? fixedBody.match(/^#\s+(.+)/m)?.[1]
      ?? doc.key.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    return (
      <>
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">{docDisplayTitle}</p>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="text-xs text-blue-400 hover:underline flex items-center gap-1"
            >
              <Maximize2 className="h-3 w-3" />
              Schermo intero
            </button>
          </div>
          <div className={cn(!showFull && isLong && "max-h-[500px] overflow-hidden relative")}>
            <MarkdownBody className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&_table]:w-full [&_table]:text-xs [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-1.5 [&_table]:border-collapse [&_th]:border [&_th]:border-border/50 [&_td]:border [&_td]:border-border/30 [&_th]:bg-muted/30 [&_th]:text-left [&_th]:font-semibold">
              {displayBody}
            </MarkdownBody>
            {!showFull && isLong && (
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-red-500/[0.03] to-transparent" />
            )}
          </div>
          {isLong && (
            <button
              type="button"
              className="mt-2 text-xs text-blue-400 hover:underline font-medium"
              onClick={() => setShowFull((v) => !v)}
            >
              {showFull ? "Mostra meno" : "Mostra tutto"}
            </button>
          )}
        </div>

        {issue.companyId && (
          <div className="px-4 pb-4">
            <WorkspaceFileBrowser companyId={issue.companyId} issueId={issue.id} />
          </div>
        )}

        <Dialog open={fullscreen} onOpenChange={setFullscreen}>
          <DialogContent
            showCloseButton={false}
            className="max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] p-0 overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
              <div>
                <h2 className="text-sm font-semibold">
                  {issue.identifier && <span className="text-muted-foreground mr-2">{issue.identifier}</span>}
                  {issue.title}
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {docDisplayTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <MarkdownBody className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&_table]:w-full [&_table]:text-xs [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-1.5 [&_table]:border-collapse [&_th]:border [&_th]:border-border/50 [&_td]:border [&_td]:border-border/30 [&_th]:bg-muted/30 [&_th]:text-left [&_th]:font-semibold">
                {fixedBody}
              </MarkdownBody>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Fallback: run content
  if (runContent) {
    return (
      <div className="px-4 py-4">
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm whitespace-pre-wrap">
          {runContent}
        </div>
      </div>
    );
  }

  // Show workspace files even if no doc/run content
  if (issue.companyId) {
    return (
      <div className="px-4 py-4 space-y-4">
        <p className="text-xs text-muted-foreground italic">Nessun documento disponibile.</p>
        <WorkspaceFileBrowser companyId={issue.companyId} issueId={issue.id} />
      </div>
    );
  }

  return <p className="px-4 py-4 text-xs text-muted-foreground italic">Nessun output disponibile.</p>;
}

/* ── Section: Commenti ────────────────────── */

function SectionCommenti({ comments, agentMap }: { comments: IssueComment[] | undefined; agentMap: Map<string, Agent> }) {
  if (!comments || comments.length === 0) {
    return <p className="px-4 py-4 text-xs text-muted-foreground italic">Nessun commento.</p>;
  }

  // Show last 5 comments, most recent first
  const recentComments = [...comments].reverse().slice(0, 5);

  return (
    <div className="divide-y divide-red-500/10">
      {recentComments.map((comment) => {
        const agent = comment.authorAgentId ? agentMap.get(comment.authorAgentId) : null;
        return (
          <div key={comment.id} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              {agent ? (
                <Identity name={agent.name} size="xs" />
              ) : (
                <Identity name="Founder" size="xs" />
              )}
              <span className="text-xs font-medium">
                {agent?.name ?? "Founder"}
              </span>
              <span className="text-[11px] text-muted-foreground">{timeAgo(comment.createdAt)}</span>
            </div>
            <div className="text-sm text-foreground/80 line-clamp-4">
              <MarkdownBody className="prose-sm dark:prose-invert max-w-none [&_p]:my-0.5">
                {comment.body}
              </MarkdownBody>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main Component ───────────────────────── */

export function IssueReviewLayout({
  issue,
  agents,
  agentMap,
  comments,
  childIssues,
  onApprove,
  onReject,
  onRevision,
  isPending,
}: Props) {
  const { t } = useTranslation();
  const [openSection, setOpenSection] = useState<AccordionSection>("output");
  const [actionMode, setActionMode] = useState<"approve" | "revision" | "reject" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showObjective, setShowObjective] = useState(false);

  const assignee = issue.assigneeAgentId ? agentMap.get(issue.assigneeAgentId) : null;
  const toggleSection = (s: AccordionSection) => setOpenSection((prev) => (prev === s ? null : s));

  // Build parent chain
  const ancestors = issue.ancestors ?? [];

  // Extract summary from agent's last comment or description
  const { data: allComments } = useQuery({
    queryKey: queryKeys.issues.comments(issue.id),
    queryFn: () => issuesApi.listComments(issue.id),
    enabled: !!issue.id,
  });

  const { data: documents } = useQuery({
    queryKey: queryKeys.issues.documents(issue.id),
    queryFn: () => issuesApi.listDocuments(issue.id),
    enabled: !!issue.id,
  });

  const agentSummary = useMemo(() => {
    if (!allComments) return null;
    // Find the last agent comment that's substantive (not just "started" or "completed")
    const agentComments = allComments
      .filter((c) => c.authorAgentId && c.body.length > 50)
      .reverse();
    return agentComments[0]?.body ?? null;
  }, [allComments]);

  const outputSummary = useMemo(() => {
    // Try sources in order, returning only clean prose summaries
    const candidates = [
      agentSummary,
      documents?.[0] ? fixMarkdownBreaks(documents[0].body) : null,
    ];
    for (const src of candidates) {
      if (!src) continue;
      const s = extractSummary(src);
      if (!s || s.length < 30) continue;
      // Reject if it contains code artifacts
      const looksLikeCode = /[`{}()<>]|rgba|px\b|bg-|text-|border-|backdrop|className|import |function |const |=>/.test(s);
      // Reject if it's mostly bold/italic markers
      const tooMuchMarkdown = (s.match(/\*\*/g)?.length ?? 0) > 2;
      if (!looksLikeCode && !tooMuchMarkdown) return s;
    }
    return null;
  }, [agentSummary, documents]);

  // Objective — short version from description
  const objectiveShort = useMemo(() => {
    if (!issue.description) return null;
    const firstHeading = issue.description.indexOf("\n## ");
    const raw = firstHeading > 0 ? issue.description.slice(0, firstHeading).trim() : issue.description;
    // Take first 200 chars
    if (raw.length <= 200) return raw;
    return raw.slice(0, 200) + "\u2026";
  }, [issue.description]);

  const handleConfirmAction = () => {
    if (actionMode === "approve") onApprove(feedback || undefined);
    else if (actionMode === "revision") onRevision(feedback || undefined);
    else if (actionMode === "reject") onReject(feedback || undefined);
    setFeedback("");
    setActionMode(null);
  };

  const openAction = (action: "approve" | "revision" | "reject") => {
    if (actionMode === action) {
      handleConfirmAction();
    } else {
      setActionMode(action);
      setFeedback("");
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      {/* ── Breadcrumb ── */}
      {ancestors.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
          {[...ancestors].reverse().map((ancestor, i) => (
            <span key={ancestor.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
              <Link
                to={`/issues/${ancestor.identifier ?? ancestor.id}`}
                className="hover:text-foreground transition-colors truncate max-w-[200px]"
                title={ancestor.title}
              >
                {ancestor.title}
              </Link>
            </span>
          ))}
        </nav>
      )}

      {/* ── Review Card ── */}
      <div className="border border-red-500/25 bg-red-500/[0.02] rounded-xl overflow-hidden">
        {/* ── Header: who did what + what to decide ── */}
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {/* Issue identifier + title */}
              <h1 className="text-lg font-bold leading-tight mb-2">
                {issue.identifier && (
                  <span className="text-muted-foreground font-mono text-sm mr-2">{issue.identifier}</span>
                )}
                {issue.title}
              </h1>

              {/* Who completed it */}
              {assignee && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                  <Identity name={assignee.name} size="sm" />
                  <span>
                    Completata da <span className="text-foreground font-medium">{assignee.name}</span>
                    <span className="text-muted-foreground/50 mx-1.5">·</span>
                    {timeAgo(issue.updatedAt)}
                  </span>
                </div>
              )}

              {/* ── Summary: what was produced ── */}
              {outputSummary && (
                <p className="text-sm text-foreground/70 leading-relaxed mb-3">
                  {outputSummary}
                </p>
              )}

              {/* ── Objective toggle (collapsible context) ── */}
              {objectiveShort && (
                <button
                  type="button"
                  onClick={() => setShowObjective((v) => !v)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-2"
                >
                  {showObjective ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Obiettivo originale
                </button>
              )}
              {showObjective && objectiveShort && (
                <div className="text-xs text-muted-foreground bg-white/[0.02] rounded-md px-3 py-2 mb-2 border border-border/20">
                  <MarkdownBody className="prose-xs dark:prose-invert max-w-none [&_p]:my-0.5">
                    {objectiveShort}
                  </MarkdownBody>
                </div>
              )}
            </div>

            {/* Action buttons — always visible */}
            <div className="flex flex-col gap-2 shrink-0 pt-1">
              <Button
                size="sm"
                className={cn("h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white min-w-[110px]",
                  actionMode === "approve" && "ring-2 ring-emerald-400/50")}
                onClick={() => openAction("approve")}
                disabled={isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Approva
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn("h-8 text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10 min-w-[110px]",
                  actionMode === "revision" && "bg-amber-500/10 ring-1 ring-amber-500/30")}
                onClick={() => openAction("revision")}
                disabled={isPending}
              >
                <RotateCcw className="h-3 w-3 mr-1.5" />
                Revisione
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn("h-8 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 min-w-[110px]",
                  actionMode === "reject" && "bg-red-500/10 ring-1 ring-red-500/30")}
                onClick={() => openAction("reject")}
                disabled={isPending}
              >
                <XCircle className="h-3 w-3 mr-1.5" />
                Rifiuta
              </Button>
            </div>
          </div>

          {/* Feedback + confirm — shown for any action */}
          {actionMode && (
            <div className="mt-3 space-y-2">
              <textarea
                className={cn(
                  "w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 resize-none",
                  actionMode === "approve" ? "border-emerald-500/20 focus:ring-emerald-500/30" :
                  actionMode === "revision" ? "border-amber-500/20 focus:ring-amber-500/30" :
                  "border-red-500/20 focus:ring-red-500/30",
                )}
                rows={2}
                placeholder={
                  actionMode === "approve" ? "Indicazioni per la fase successiva... (opzionale)" :
                  actionMode === "revision" ? "Cosa deve migliorare o rifare?" :
                  "Motivo del rifiuto... (opzionale)"
                }
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                autoFocus
              />
              <div className="flex items-center gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => { setActionMode(null); setFeedback(""); }}
                >
                  Annulla
                </Button>
                <Button
                  size="sm"
                  className={cn("h-7 text-xs text-white",
                    actionMode === "approve" ? "bg-emerald-600 hover:bg-emerald-700" :
                    actionMode === "revision" ? "bg-amber-600 hover:bg-amber-700" :
                    "bg-red-600 hover:bg-red-700",
                  )}
                  onClick={handleConfirmAction}
                  disabled={isPending}
                >
                  {actionMode === "approve" ? "Conferma approvazione" :
                   actionMode === "revision" ? "Invia revisione" :
                   "Conferma rifiuto"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Tab bar: Output + Commenti + Sub-issue ── */}
        <div className="flex border-t border-red-500/10">
          <SectionButton label="Output" isOpen={openSection === "output"} onClick={() => toggleSection("output")} />
          <SectionButton
            label="Commenti"
            isOpen={openSection === "commenti"}
            onClick={() => toggleSection("commenti")}
            badge={comments?.length}
          />
          {childIssues.length > 0 && (
            <SectionButton
              label="Sotto-attivita'"
              isOpen={openSection === "subissues"}
              onClick={() => toggleSection("subissues")}
              badge={childIssues.length}
            />
          )}
        </div>

        {/* ── Tab content ── */}
        {openSection && (
          <div className="border-t border-red-500/10">
            {openSection === "output" && <SectionOutput issue={issue} />}
            {openSection === "commenti" && <SectionCommenti comments={comments} agentMap={agentMap} />}
            {openSection === "subissues" && (
              <div className="divide-y divide-red-500/10">
                {childIssues.map((child) => (
                  <Link
                    key={child.id}
                    to={`/issues/${child.identifier ?? child.id}`}
                    className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-red-500/5 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusIcon status={child.status} />
                      <span className="font-mono text-muted-foreground text-xs shrink-0">
                        {child.identifier ?? child.id.slice(0, 8)}
                      </span>
                      <span className="truncate">{child.title}</span>
                    </div>
                    {child.assigneeAgentId && (() => {
                      const name = agentMap.get(child.assigneeAgentId)?.name;
                      return name ? <Identity name={name} size="sm" /> : null;
                    })()}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
