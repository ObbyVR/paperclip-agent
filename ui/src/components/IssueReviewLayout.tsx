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
  AlertCircle, CheckCircle2, ChevronRight, Maximize2,
  MessageSquare, RotateCcw, X, XCircle,
} from "lucide-react";
import type { Agent, Issue, IssueComment } from "@paperclipai/shared";

/* ── Types ────────────────────────────────── */

type Props = {
  issue: Issue;
  agents: Agent[];
  agentMap: Map<string, Agent>;
  comments: IssueComment[] | undefined;
  childIssues: Issue[];
  onApprove: () => void;
  onReject: () => void;
  onRevision: (feedback?: string) => void;
  isPending: boolean;
};

type AccordionSection = "output" | "obiettivo" | "riepilogo" | "commenti" | "subissues" | null;

/* ── Helpers ──────────────────────────────── */

function fixMarkdownBreaks(md: string): string {
  return md
    .replace(/(\*\*[^*]+:\*\*[^\n]*)\n(\*\*[^*]+:\*\*)/g, "$1\n\n$2")
    .replace(/([^\n])\n(\*\*[^*]+:\*\*)/g, "$1\n\n$2")
    .replace(/([^\n])\n(\* )/g, "$1\n\n$2");
}

function parseObiettivo(description: string): string {
  if (!description) return "";
  // Extract up to the first ## heading (just the intro/objective part)
  const firstHeading = description.indexOf("\n## ");
  if (firstHeading > 0) return description.slice(0, firstHeading).trim();
  // If short, return as-is
  if (description.length < 500) return description;
  // Otherwise truncate
  return description.slice(0, 500) + "...";
}

function extractRunContent(run: { resultJson?: unknown; status: string }): string | null {
  if (run.status !== "succeeded" && run.status !== "completed") return null;
  const result = run.resultJson as Record<string, unknown> | null;
  if (!result) return null;
  if (typeof result.content === "string" && result.content.length > 0) return result.content;
  return null;
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

    return (
      <>
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">{doc.title ?? doc.key}</p>
              <p className="text-[11px] text-muted-foreground">
                {Math.round(doc.body.length / 1000)}k caratteri
              </p>
            </div>
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
                  {doc.title ?? doc.key} — {Math.round(doc.body.length / 1000)}k caratteri
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

  return <p className="px-4 py-4 text-xs text-muted-foreground italic">Nessun output disponibile.</p>;
}

/* ── Section: Obiettivo ───────────────────── */

function SectionObiettivo({ description }: { description: string }) {
  const obiettivo = parseObiettivo(description);
  if (!obiettivo) {
    return <p className="px-4 py-4 text-xs text-muted-foreground italic">Nessun obiettivo.</p>;
  }
  return (
    <div className="px-4 py-4">
      <MarkdownBody className="prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5">
        {obiettivo}
      </MarkdownBody>
    </div>
  );
}

/* ── Section: Riepilogo ───────────────────── */

function SectionRiepilogo({ issueId }: { issueId: string }) {
  const { data: comments, isLoading } = useQuery({
    queryKey: queryKeys.issues.comments(issueId),
    queryFn: () => issuesApi.listComments(issueId),
    enabled: !!issueId,
  });

  const agentSummary = useMemo(() => {
    if (!comments) return null;
    const agentComments = comments.filter((c) => c.authorAgentId);
    return agentComments.length > 0 ? agentComments[agentComments.length - 1] : null;
  }, [comments]);

  if (isLoading) {
    return (
      <div className="px-4 py-4">
        <div className="animate-pulse bg-muted/30 rounded h-12" />
      </div>
    );
  }

  if (!agentSummary) {
    return <p className="px-4 py-4 text-xs text-muted-foreground italic">Nessun riepilogo disponibile.</p>;
  }

  return (
    <div className="px-4 py-4">
      <MarkdownBody className="prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_strong]:text-foreground/90">
        {agentSummary.body}
      </MarkdownBody>
    </div>
  );
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
        const isAgent = !!comment.authorAgentId;
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
  const [feedbackMode, setFeedbackMode] = useState(false);
  const [feedback, setFeedback] = useState("");

  const assignee = issue.assigneeAgentId ? agentMap.get(issue.assigneeAgentId) : null;
  const toggleSection = (s: AccordionSection) => setOpenSection((prev) => (prev === s ? null : s));

  // Build parent chain
  const ancestors = issue.ancestors ?? [];

  const handleRevision = () => {
    onRevision(feedback || undefined);
    setFeedback("");
    setFeedbackMode(false);
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
        {/* Header */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            <span className="text-red-400 font-medium">Approvazione richiesta</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{timeAgo(issue.updatedAt)}</span>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight mb-2">
                {issue.identifier && (
                  <span className="text-muted-foreground font-mono text-sm mr-2">{issue.identifier}</span>
                )}
                {issue.title}
              </h1>
              {assignee && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Identity name={assignee.name} size="sm" />
                  <span>Completata da <span className="text-foreground font-medium">{assignee.name}</span></span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                onClick={() => {
                  if (feedbackMode) {
                    handleRevision();
                  } else {
                    setFeedbackMode(true);
                  }
                }}
                disabled={isPending}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Revisione
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={onReject}
                disabled={isPending}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Rifiuta
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={onApprove}
                disabled={isPending}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Approva
              </Button>
            </div>
          </div>

          {/* Feedback textarea (shown when Revisione clicked) */}
          {feedbackMode && (
            <div className="mt-3 space-y-2">
              <textarea
                className="w-full rounded-lg border border-red-500/20 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-red-500/30 resize-none"
                rows={3}
                placeholder="Scrivi il feedback per l'agente... (cosa deve migliorare?)"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                autoFocus
              />
              <div className="flex items-center gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => { setFeedbackMode(false); setFeedback(""); }}
                >
                  Annulla
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleRevision}
                  disabled={isPending}
                >
                  Invia revisione
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Accordion section buttons ── */}
        <div className="flex border-t border-red-500/10">
          <SectionButton label="Output" isOpen={openSection === "output"} onClick={() => toggleSection("output")} />
          <SectionButton label="Obiettivo" isOpen={openSection === "obiettivo"} onClick={() => toggleSection("obiettivo")} />
          <SectionButton label="Riepilogo" isOpen={openSection === "riepilogo"} onClick={() => toggleSection("riepilogo")} />
          <SectionButton
            label="Commenti"
            isOpen={openSection === "commenti"}
            onClick={() => toggleSection("commenti")}
            badge={comments?.length}
          />
          {childIssues.length > 0 && (
            <SectionButton
              label="Sub-issue"
              isOpen={openSection === "subissues"}
              onClick={() => toggleSection("subissues")}
              badge={childIssues.length}
            />
          )}
        </div>

        {/* ── Accordion content ── */}
        {openSection && (
          <div className="border-t border-red-500/10">
            {openSection === "output" && <SectionOutput issue={issue} />}
            {openSection === "obiettivo" && <SectionObiettivo description={issue.description ?? ""} />}
            {openSection === "riepilogo" && <SectionRiepilogo issueId={issue.id} />}
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
