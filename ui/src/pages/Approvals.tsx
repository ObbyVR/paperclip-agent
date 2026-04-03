import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation, Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { approvalsApi } from "../api/approvals";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { activityApi, type RunForIssue } from "../api/activity";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { PageTabBar } from "../components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, AlertCircle, CheckCircle2, XCircle, FileText,
  ChevronRight, RotateCcw, Globe, Download, ExternalLink, Maximize2, X,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ApprovalCard } from "../components/ApprovalCard";
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { PageSkeleton } from "../components/PageSkeleton";
import { MarkdownBody } from "../components/MarkdownBody";
import type { Issue, Agent } from "@paperclipai/shared";

type StatusFilter = "pending" | "in_review" | "approved" | "rejected" | "blocked" | "all";

const VALID_TABS: StatusFilter[] = ["pending", "in_review", "approved", "rejected", "blocked", "all"];

// ── Blocked issue card — compact + accordion tabs ────────────

type AccordionTab = "obiettivo" | "riepilogo" | "output" | null;

function BlockedIssueCard({
  issue,
  agents,
  allIssues,
  onApprove,
  onReject,
  onRevision,
  isPending,
}: {
  issue: Issue;
  agents: Agent[];
  allIssues: Issue[];
  onApprove: () => void;
  onReject: () => void;
  onRevision: () => void;
  isPending: boolean;
}) {
  const [openTab, setOpenTab] = useState<AccordionTab>(null);
  const assignee = issue.assigneeAgentId
    ? agents.find((a) => a.id === issue.assigneeAgentId)
    : null;

  const toggleTab = (tab: AccordionTab) => setOpenTab((prev) => (prev === tab ? null : tab));

  // Build parent chain breadcrumb
  const parentChain = useMemo(() => {
    const chain: Issue[] = [];
    let current: Issue | undefined = issue;
    const visited = new Set<string>();
    while (current?.parentId && !visited.has(current.parentId)) {
      visited.add(current.parentId);
      const parent = allIssues.find((i) => i.id === current!.parentId);
      if (parent) {
        chain.unshift(parent);
        current = parent;
      } else {
        break;
      }
    }
    return chain;
  }, [issue, allIssues]);

  return (
    <div className="border border-amber-500/20 bg-amber-500/[0.03] rounded-lg overflow-hidden">
      {/* ── Compact header ── */}
      <div className="px-4 py-3">
        {/* Parent chain breadcrumb */}
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
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="font-medium text-sm">
                {issue.identifier && (
                  <span className="text-muted-foreground mr-1.5">{issue.identifier}</span>
                )}
                {issue.title}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {assignee && (
                <span className="flex items-center gap-1">
                  <Identity name={assignee.name} size="sm" className="inline-flex" />
                </span>
              )}
              <span>{timeAgo(issue.updatedAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
              onClick={onRevision}
              disabled={isPending}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Revisione
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={onReject}
              disabled={isPending}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Rifiuta
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={onApprove}
              disabled={isPending}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Approva
            </Button>
          </div>
        </div>
      </div>

      {/* ── Accordion tab buttons ── */}
      <div className="flex border-t border-amber-500/10">
        <AccordionTabButton
          label="Obiettivo"
          isOpen={openTab === "obiettivo"}
          onClick={() => toggleTab("obiettivo")}
        />
        <AccordionTabButton
          label="Riepilogo"
          isOpen={openTab === "riepilogo"}
          onClick={() => toggleTab("riepilogo")}
        />
        <AccordionTabButton
          label="Output"
          isOpen={openTab === "output"}
          onClick={() => toggleTab("output")}
        />
      </div>

      {/* ── Accordion content ── */}
      {openTab && (
        <div className="border-t border-amber-500/10">
          {openTab === "obiettivo" && <TabObiettivo description={issue.description ?? ""} />}
          {openTab === "riepilogo" && <TabRiepilogo issueId={issue.id} />}
          {openTab === "output" && <TabOutput issue={issue} />}
        </div>
      )}
    </div>
  );
}

function AccordionTabButton({ label, isOpen, onClick }: { label: string; isOpen: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 py-2 text-xs font-medium text-center transition-colors",
        "hover:bg-amber-500/5",
        "border-r last:border-r-0 border-amber-500/10",
        isOpen
          ? "text-amber-400 bg-amber-500/[0.06]"
          : "text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

// ── Tab: Obiettivo — parsed from task description ──────────────

function TabObiettivo({ description }: { description: string }) {
  if (!description) {
    return <p className="px-4 py-3 text-xs text-muted-foreground italic">Nessuna descrizione.</p>;
  }

  // Extract structured sections
  const sections = parseTaskSections(description);

  return (
    <div className="px-4 py-3 space-y-3">
      {sections.map((section, i) => (
        <div key={i}>
          {section.heading && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              {section.heading}
            </p>
          )}
          <div className="text-sm text-foreground/80">
            <MarkdownBody className="prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5">
              {section.body}
            </MarkdownBody>
          </div>
        </div>
      ))}
    </div>
  );
}

function parseTaskSections(desc: string): Array<{ heading: string; body: string }> {
  const sections: Array<{ heading: string; body: string }> = [];
  const parts = desc.split(/^##\s+/m);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const newlineIdx = trimmed.indexOf("\n");
    if (newlineIdx > 0 && parts.indexOf(part) > 0) {
      sections.push({
        heading: trimmed.slice(0, newlineIdx).trim(),
        body: trimmed.slice(newlineIdx + 1).trim(),
      });
    } else {
      sections.push({ heading: "", body: trimmed });
    }
  }

  return sections;
}

// ── Tab: Riepilogo — agent's last comment ──────────────────────

function TabRiepilogo({ issueId }: { issueId: string }) {
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
      <div className="px-4 py-3">
        <div className="animate-pulse bg-muted/30 rounded h-12" />
      </div>
    );
  }

  if (!agentSummary) {
    return <p className="px-4 py-3 text-xs text-muted-foreground italic">Nessun riepilogo disponibile.</p>;
  }

  return (
    <div className="px-4 py-3">
      <div className="text-sm">
        <MarkdownBody className="prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_strong]:text-foreground/90">
          {agentSummary.body}
        </MarkdownBody>
      </div>
    </div>
  );
}

// ── Tab: Output — document or run result ───────────────────────

// Pre-process markdown: ensure proper line breaks for **key:** value patterns
// and other single-newline sequences that CommonMark collapses
function fixMarkdownBreaks(md: string): string {
  return md
    // Single newline between **bold:** lines → double newline
    .replace(/(\*\*[^*]+:\*\*[^\n]*)\n(\*\*[^*]+:\*\*)/g, "$1\n\n$2")
    // Single newline after a line ending with text, before a **bold** line
    .replace(/([^\n])\n(\*\*[^*]+:\*\*)/g, "$1\n\n$2")
    // Ensure list items after paragraphs have spacing
    .replace(/([^\n])\n(\* )/g, "$1\n\n$2");
}

function TabOutput({ issue }: { issue: Issue }) {
  const [showFull, setShowFull] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const { data: documents, isLoading: docsLoading } = useQuery({
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

  if (docsLoading) {
    return (
      <div className="px-4 py-3">
        <div className="animate-pulse bg-muted/30 rounded h-20" />
      </div>
    );
  }

  // Document output (primary)
  const doc = documents?.[0];
  if (doc) {
    const fixedBody = fixMarkdownBreaks(doc.body);
    const isLong = fixedBody.length > 3000;
    const displayBody = showFull || !isLong ? fixedBody : fixedBody.slice(0, 3000);

    return (
      <>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-muted-foreground">
              {doc.title ?? doc.key} — {Math.round(doc.body.length / 1000)}k caratteri
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
              >
                <Maximize2 className="h-3 w-3" />
                Schermo intero
              </button>
              <Link
                to={`/issues/${issue.identifier ?? issue.id}`}
                className="text-[11px] text-blue-400 hover:underline"
              >
                Apri issue
              </Link>
            </div>
          </div>
          <div className={cn(
            !showFull && isLong && "max-h-[500px] overflow-hidden relative",
          )}>
            <MarkdownBody className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
              {displayBody}
            </MarkdownBody>
            {!showFull && isLong && (
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-amber-500/[0.05] to-transparent" />
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

        {/* Fullscreen dialog */}
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

  // Run output fallback
  if (runContent) {
    return (
      <div className="px-4 py-3">
        <InlineOutputPreview content={runContent} title={issue.title} />
      </div>
    );
  }

  return <p className="px-4 py-3 text-xs text-muted-foreground italic">Nessun output disponibile.</p>;
}

// ── Inline output preview (HTML, text) ─────────────────────────

function extractRunContent(run: RunForIssue): string | null {
  const rj = run.resultJson;
  if (!rj) return null;
  if (typeof rj.content === "string" && rj.content.length > 0) return rj.content;
  if (rj.report && typeof rj.report === "object") {
    const report = rj.report as Record<string, unknown>;
    if (typeof report.content === "string") return report.content;
    if (Array.isArray(report.sections)) {
      const parts = (report.sections as Array<Record<string, unknown>>)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
        .map((s) => `## ${s.title ?? ""}\n\n${s.content ?? ""}`)
        .join("\n\n");
      return parts || null;
    }
  }
  return null;
}

function isHtml(content: string): boolean {
  const t = content.trim();
  return t.startsWith("<!DOCTYPE") || t.startsWith("<html") || t.startsWith("```html");
}

function cleanHtml(content: string): string {
  return content.replace(/^```html\n?/, "").replace(/\n?```$/, "");
}

function InlineOutputPreview({ content, title }: { content: string; title: string }) {
  const [showPreview, setShowPreview] = useState(false);

  if (isHtml(content)) {
    const htmlContent = cleanHtml(content);
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Output HTML
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => setShowPreview((v) => !v)}
            >
              <Globe className="h-3 w-3 mr-1" />
              {showPreview ? "Nascondi" : "Anteprima"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => {
                const w = window.open("", "_blank");
                if (w) {
                  w.document.write(htmlContent);
                  w.document.close();
                }
              }}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Apri
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => {
                const blob = new Blob([htmlContent], { type: "text/html" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${title.replace(/\s+/g, "-").toLowerCase()}.html`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-3 w-3 mr-1" />
              Scarica
            </Button>
          </div>
        </div>
        {showPreview && (
          <iframe
            srcDoc={htmlContent}
            className="w-full h-[400px] rounded border border-border"
            sandbox="allow-scripts"
            title={`Preview: ${title}`}
          />
        )}
      </div>
    );
  }

  // Text output — truncated
  const maxLen = 500;
  const truncated = content.length > maxLen;
  const [showFull, setShowFull] = useState(false);

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        Output
      </p>
      <div className="text-xs text-foreground/80 whitespace-pre-wrap bg-muted/20 rounded p-2 max-h-[300px] overflow-y-auto">
        {showFull || !truncated ? content : content.slice(0, maxLen) + "..."}
      </div>
      {truncated && (
        <button
          type="button"
          className="text-[11px] text-blue-400 hover:underline mt-1"
          onClick={() => setShowFull((v) => !v)}
        >
          {showFull ? "Mostra meno" : "Mostra tutto"}
        </button>
      )}
    </div>
  );
}

// ── Group issues by agent ──────────────────────────────────────

function groupByAgent(issues: Issue[], agents: Agent[]): Map<string, { agent: Agent | null; issues: Issue[] }> {
  const groups = new Map<string, { agent: Agent | null; issues: Issue[] }>();
  for (const issue of issues) {
    const key = issue.assigneeAgentId ?? "__unassigned__";
    if (!groups.has(key)) {
      const agent = issue.assigneeAgentId
        ? agents.find((a) => a.id === issue.assigneeAgentId) ?? null
        : null;
      groups.set(key, { agent, issues: [] });
    }
    groups.get(key)!.issues.push(issue);
  }
  return groups;
}

// ── Main page ──────────────────────────────────────────────────

export function Approvals() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [actionError, setActionError] = useState<string | null>(null);

  const pathSegment = location.pathname.split("/").pop() ?? "pending";
  const statusFilter: StatusFilter = VALID_TABS.includes(pathSegment as StatusFilter)
    ? (pathSegment as StatusFilter)
    : "pending";

  useEffect(() => {
    setBreadcrumbs([{ label: t("approval.title") }]);
  }, [setBreadcrumbs, t]);

  // ── Queries ──

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!),
    queryFn: () => approvalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: allIssues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // ── Derived data ──

  const approvals = data ?? [];
  const agentList = agents ?? [];
  const issueList = allIssues ?? [];

  const blockedIssues = useMemo(
    () =>
      issueList
        .filter((i) => i.status === "blocked")
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [issueList],
  );

  const inReviewIssues = useMemo(
    () =>
      issueList
        .filter((i) => i.status === "in_review")
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [issueList],
  );

  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.status === "pending" || a.status === "revision_requested"),
    [approvals],
  );

  const approvedApprovals = useMemo(
    () =>
      approvals
        .filter((a) => a.status === "approved")
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [approvals],
  );

  const rejectedApprovals = useMemo(
    () =>
      approvals
        .filter((a) => a.status === "rejected")
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [approvals],
  );

  // Issues approved by founder (done with assignee = agent, i.e. work completed by agents)
  const founderApprovedIssues = useMemo(
    () =>
      issueList
        .filter((i) => i.status === "done" && i.assigneeAgentId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [issueList],
  );

  // Issues rejected by founder (cancelled with assignee = agent)
  const founderRejectedIssues = useMemo(
    () =>
      issueList
        .filter((i) => i.status === "cancelled" && i.assigneeAgentId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [issueList],
  );

  const totalApproved = approvedApprovals.length + founderApprovedIssues.length;
  const totalRejected = rejectedApprovals.length + founderRejectedIssues.length;
  const pendingCount = pendingApprovals.length + blockedIssues.length;

  // ── Choose what to display ──

  const filtered = useMemo(() => {
    switch (statusFilter) {
      case "pending":
        return pendingApprovals.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      case "approved":
        return approvedApprovals;
      case "rejected":
        return rejectedApprovals;
      case "all":
        return [...approvals].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      default:
        return [];
    }
  }, [statusFilter, pendingApprovals, approvedApprovals, rejectedApprovals, approvals]);

  const showBlockedSection = statusFilter === "pending" || statusFilter === "blocked";
  const showInReviewSection = statusFilter === "in_review";

  // ── Mutations ──

  const unblockMutation = useMutation({
    mutationFn: async ({
      issueId,
      action,
    }: {
      issueId: string;
      action: "approve" | "reject" | "revision";
    }) => {
      if (action === "revision") {
        await issuesApi.addComment(issueId, "🔄 Revisione richiesta dal founder. Rielabora l'output e ripresenta.");
        return issuesApi.update(issueId, { status: "in_progress" });
      }
      const newStatus = action === "approve" ? "done" : "cancelled";
      const comment =
        action === "approve"
          ? "✅ Approvato dal founder."
          : "❌ Rifiutato dal founder.";
      await issuesApi.addComment(issueId, comment);
      return issuesApi.update(issueId, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: (_approval, id) => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(`/approvals/${id}?resolved=approved`);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to approve");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reject");
    },
  });

  // ── Guards ──

  if (!selectedCompanyId) {
    return <p className="text-sm text-muted-foreground">Select a company first.</p>;
  }

  if (isLoading) {
    return <PageSkeleton variant="approvals" />;
  }

  // ── Group blocked issues by agent ──

  const blockedGroups = groupByAgent(
    statusFilter === "blocked" ? blockedIssues : blockedIssues,
    agentList,
  );

  return (
    <div className="space-y-4">
      {/* ── Tab bar ── */}
      <div className="flex items-center justify-between">
        <Tabs value={statusFilter} onValueChange={(v) => navigate(`/approvals/${v}`)}>
          <PageTabBar
            items={[
              {
                value: "pending",
                label: (
                  <>
                    In sospeso
                    {pendingCount > 0 && (
                      <span
                        className={cn(
                          "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          "bg-yellow-500/20 text-yellow-500",
                        )}
                      >
                        {pendingCount}
                      </span>
                    )}
                  </>
                ),
              },
              {
                value: "approved",
                label: (
                  <>
                    Approvate
                    {totalApproved > 0 && (
                      <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-500">
                        {totalApproved}
                      </span>
                    )}
                  </>
                ),
              },
              {
                value: "rejected",
                label: (
                  <>
                    Rifiutate
                    {totalRejected > 0 && (
                      <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-500">
                        {totalRejected}
                      </span>
                    )}
                  </>
                ),
              },
              {
                value: "in_review",
                label: (
                  <>
                    In revisione
                    {inReviewIssues.length > 0 && (
                      <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-500">
                        {inReviewIssues.length}
                      </span>
                    )}
                  </>
                ),
              },
              {
                value: "blocked",
                label: (
                  <>
                    Bloccate
                    {blockedIssues.length > 0 && (
                      <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-500">
                        {blockedIssues.length}
                      </span>
                    )}
                  </>
                ),
              },
              { value: "all", label: "Tutte" },
            ]}
          />
        </Tabs>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {/* ── Formal approval cards (pending/all tabs) ── */}
      {(statusFilter === "pending" || statusFilter === "all") && filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              requesterAgent={
                approval.requestedByAgentId
                  ? agentList.find((a) => a.id === approval.requestedByAgentId) ?? null
                  : null
              }
              onApprove={() => approveMutation.mutate(approval.id)}
              onReject={() => rejectMutation.mutate(approval.id)}
              detailLink={`/approvals/${approval.id}`}
              isPending={approveMutation.isPending || rejectMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* ── Approved tab: formal approvals + founder-approved issues ── */}
      {statusFilter === "approved" && (
        <div className="grid gap-3">
          {approvedApprovals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              requesterAgent={
                approval.requestedByAgentId
                  ? agentList.find((a) => a.id === approval.requestedByAgentId) ?? null
                  : null
              }
              onApprove={() => {}}
              onReject={() => {}}
              detailLink={`/approvals/${approval.id}`}
              isPending={false}
            />
          ))}
          {founderApprovedIssues.map((issue) => (
            <ResolvedIssueCard key={issue.id} issue={issue} agents={agentList} resolution="approved" />
          ))}
        </div>
      )}

      {/* ── Rejected tab: formal rejections + founder-rejected issues ── */}
      {statusFilter === "rejected" && (
        <div className="grid gap-3">
          {rejectedApprovals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              requesterAgent={
                approval.requestedByAgentId
                  ? agentList.find((a) => a.id === approval.requestedByAgentId) ?? null
                  : null
              }
              onApprove={() => {}}
              onReject={() => {}}
              detailLink={`/approvals/${approval.id}`}
              isPending={false}
            />
          ))}
          {founderRejectedIssues.map((issue) => (
            <ResolvedIssueCard key={issue.id} issue={issue} agents={agentList} resolution="rejected" />
          ))}
        </div>
      )}

      {/* ── Blocked issues section ── */}
      {showBlockedSection && blockedIssues.length > 0 && (
        <>
          {statusFilter === "pending" && (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-6 mb-2 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5" />
              Issue in attesa di review ({blockedIssues.length})
            </h3>
          )}
          <div className="grid gap-3">
            {Array.from(blockedGroups.entries()).map(([key, group]) => (
              <div key={key}>
                {blockedGroups.size > 1 && (
                  <div className="flex items-center gap-2 mt-4 mb-3 pb-2 border-b border-border/50">
                    <Identity
                      name={group.agent?.name ?? "Non assegnato"}
                      size="default"
                    />
                    <span className="text-sm font-medium text-foreground/80">
                      {group.agent?.name ?? "Non assegnato"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {group.issues.length} {group.issues.length === 1 ? "issue" : "issues"}
                    </span>
                  </div>
                )}
                <div className="grid gap-3">
                  {group.issues.map((issue) => (
                    <BlockedIssueCard
                      key={issue.id}
                      issue={issue}
                      agents={agentList}
                      allIssues={issueList}
                      onApprove={() =>
                        unblockMutation.mutate({ issueId: issue.id, action: "approve" })
                      }
                      onReject={() =>
                        unblockMutation.mutate({ issueId: issue.id, action: "reject" })
                      }
                      onRevision={() =>
                        unblockMutation.mutate({ issueId: issue.id, action: "revision" })
                      }
                      isPending={unblockMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── In review issues section ── */}
      {showInReviewSection && inReviewIssues.length > 0 && (
        <div className="grid gap-3">
          {(() => {
            const inReviewGroups = groupByAgent(inReviewIssues, agentList);
            return Array.from(inReviewGroups.entries()).map(([key, group]) => (
              <div key={key}>
                {inReviewGroups.size > 1 && (
                  <div className="flex items-center gap-2 mt-4 mb-3 pb-2 border-b border-border/50">
                    <Identity
                      name={group.agent?.name ?? "Non assegnato"}
                      size="default"
                    />
                    <span className="text-sm font-medium text-foreground/80">
                      {group.agent?.name ?? "Non assegnato"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {group.issues.length} {group.issues.length === 1 ? "issue" : "issues"}
                    </span>
                  </div>
                )}
                <div className="grid gap-3">
                  {group.issues.map((issue) => (
                    <BlockedIssueCard
                      key={issue.id}
                      issue={issue}
                      agents={agentList}
                      allIssues={issueList}
                      onApprove={() =>
                        unblockMutation.mutate({ issueId: issue.id, action: "approve" })
                      }
                      onReject={() =>
                        unblockMutation.mutate({ issueId: issue.id, action: "reject" })
                      }
                      onRevision={() =>
                        unblockMutation.mutate({ issueId: issue.id, action: "revision" })
                      }
                      isPending={unblockMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* ── All tab: also show resolved issues ── */}
      {statusFilter === "all" && (founderApprovedIssues.length > 0 || founderRejectedIssues.length > 0) && (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-6 mb-2">
            Task risolti ({founderApprovedIssues.length + founderRejectedIssues.length})
          </h3>
          <div className="grid gap-3">
            {[...founderApprovedIssues, ...founderRejectedIssues]
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .map((issue) => (
                <ResolvedIssueCard
                  key={issue.id}
                  issue={issue}
                  agents={agentList}
                  resolution={issue.status === "done" ? "approved" : "rejected"}
                />
              ))}
          </div>
        </>
      )}

      {/* ── Empty state ── */}
      {statusFilter === "pending" && pendingCount === 0 && filtered.length === 0 && (
        <EmptyState message={t("approval.noPending")} />
      )}
      {statusFilter === "approved" && totalApproved === 0 && (
        <EmptyState message="Nessuna approvazione completata." />
      )}
      {statusFilter === "rejected" && totalRejected === 0 && (
        <EmptyState message="Nessuna richiesta rifiutata." />
      )}
      {statusFilter === "in_review" && inReviewIssues.length === 0 && (
        <EmptyState message="Nessuna issue in revisione." />
      )}
      {statusFilter === "blocked" && blockedIssues.length === 0 && (
        <EmptyState message="Nessuna issue bloccata." />
      )}
      {statusFilter === "all" && approvals.length === 0 && founderApprovedIssues.length === 0 && founderRejectedIssues.length === 0 && (
        <EmptyState message={t("approval.none")} />
      )}
    </div>
  );
}

// ── Resolved issue card (for approved/rejected tabs) ───────────

function ResolvedIssueCard({
  issue,
  agents,
  resolution,
}: {
  issue: Issue;
  agents: Agent[];
  resolution: "approved" | "rejected";
}) {
  const assignee = issue.assigneeAgentId
    ? agents.find((a) => a.id === issue.assigneeAgentId)
    : null;

  const borderColor = resolution === "approved" ? "border-green-500/20" : "border-red-500/20";
  const bgColor = resolution === "approved" ? "bg-green-500/[0.03]" : "bg-red-500/[0.03]";
  const StatusIcon = resolution === "approved" ? CheckCircle2 : XCircle;
  const iconColor = resolution === "approved" ? "text-green-500" : "text-red-500";
  const label = resolution === "approved" ? "Approvata" : "Rifiutata";

  return (
    <div className={cn("border rounded-lg px-4 py-3", borderColor, bgColor)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusIcon className={cn("h-4 w-4 shrink-0", iconColor)} />
            <Link
              to={`/issues/${issue.identifier ?? issue.id}`}
              className="font-medium text-sm hover:underline"
            >
              {issue.identifier && (
                <span className="text-muted-foreground mr-1.5">{issue.identifier}</span>
              )}
              {issue.title}
            </Link>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {assignee && (
              <span className="flex items-center gap-1">
                <Identity name={assignee.name} size="sm" className="inline-flex" />
              </span>
            )}
            <span className={cn("font-medium", iconColor)}>{label}</span>
            <span>{timeAgo(issue.updatedAt)}</span>
          </div>
        </div>
        <Link
          to={`/issues/${issue.identifier ?? issue.id}`}
          className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
        >
          Dettagli
        </Link>
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ShieldCheck className="h-8 w-8 text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
