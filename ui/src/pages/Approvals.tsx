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
  ChevronRight, RotateCcw, Globe, Download, ExternalLink,
} from "lucide-react";
import { ApprovalCard } from "../components/ApprovalCard";
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { PageSkeleton } from "../components/PageSkeleton";
import { MarkdownBody } from "../components/MarkdownBody";
import type { Issue, Agent } from "@paperclipai/shared";

type StatusFilter = "pending" | "approved" | "rejected" | "blocked" | "all";

const VALID_TABS: StatusFilter[] = ["pending", "approved", "rejected", "blocked", "all"];

// ── Blocked issue card — flat layout, no double-expand ────────

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
  const assignee = issue.assigneeAgentId
    ? agents.find((a) => a.id === issue.assigneeAgentId)
    : null;

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

  // Parse task description into structured fields
  const taskFields = useMemo(() => parseTaskDescription(issue.description ?? ""), [issue.description]);

  return (
    <div className="border border-amber-500/20 bg-amber-500/[0.03] rounded-lg overflow-hidden">
      {/* ── Header ── */}
      <div className="p-4 pb-3">
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
                  Completata da{" "}
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

      {/* ── Task summary (compact) ── */}
      {taskFields.objective && (
        <div className="px-4 pb-3 border-t border-amber-500/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-1">
            Obiettivo
          </p>
          <p className="text-sm text-foreground/80">{taskFields.objective}</p>
        </div>
      )}

      {/* ── Output: directly visible ── */}
      <BlockedIssueOutput issue={issue} />
    </div>
  );
}

// ── Parse structured task description ──────────────────────────

function parseTaskDescription(desc: string): { objective: string; rest: string } {
  if (!desc) return { objective: "", rest: "" };

  // Try to extract "## Obiettivo" section
  const objMatch = desc.match(/##\s*Obiettivo\s*\n+([\s\S]*?)(?=\n##\s|\n\*\*Output|$)/i);
  if (objMatch) {
    const objective = objMatch[1].trim();
    const rest = desc.replace(objMatch[0], "").trim();
    return { objective, rest };
  }

  // Fallback: first line or first paragraph
  const firstPara = desc.split(/\n\n/)[0].trim();
  if (firstPara.length < 300) {
    return { objective: firstPara, rest: desc.slice(firstPara.length).trim() };
  }

  return { objective: "", rest: desc };
}

// ── Output section — loads data, shown flat ────────────────────

function BlockedIssueOutput({ issue }: { issue: Issue }) {
  const { data: documents, isLoading } = useQuery({
    queryKey: queryKeys.issues.documents(issue.id),
    queryFn: () => issuesApi.listDocuments(issue.id),
    enabled: !!issue.id,
  });

  const { data: comments } = useQuery({
    queryKey: queryKeys.issues.comments(issue.id),
    queryFn: () => issuesApi.listComments(issue.id),
    enabled: !!issue.id,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.issues.runs(issue.id),
    queryFn: () => activityApi.runsForIssue(issue.id),
    enabled: !!issue.id,
  });

  // Agent's last comment
  const agentSummary = useMemo(() => {
    if (!comments) return null;
    const agentComments = comments.filter((c) => c.authorAgentId);
    return agentComments.length > 0 ? agentComments[agentComments.length - 1] : null;
  }, [comments]);

  // Run output fallback
  const runContent = useMemo(() => {
    if (!runs) return null;
    for (const run of runs.filter((r) => r.status === "succeeded" || r.status === "completed")) {
      const content = extractRunContent(run);
      if (content) return content;
    }
    return null;
  }, [runs]);

  const hasOutput = (documents && documents.length > 0) || runContent;

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-t border-amber-500/10">
        <div className="animate-pulse bg-muted/30 rounded h-16 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">Caricamento output...</span>
        </div>
      </div>
    );
  }

  if (!hasOutput && !agentSummary) return null;

  return (
    <div className="border-t border-amber-500/10">
      {/* Agent summary — shown as compact banner */}
      {agentSummary && (
        <div className="px-4 py-2 bg-muted/10 border-b border-border/30">
          <div className="text-xs text-foreground/70">
            <MarkdownBody className="prose-xs [&_p]:my-0.5 [&_ul]:my-0.5 [&_strong]:text-foreground/90">{agentSummary.body}</MarkdownBody>
          </div>
        </div>
      )}

      {/* Document output — the actual deliverable */}
      {documents && documents.length > 0 && documents.map((doc) => (
        <DocumentInlinePreview key={doc.key} doc={doc} issue={issue} />
      ))}

      {/* Run output fallback */}
      {(!documents || documents.length === 0) && runContent && (
        <div className="px-4 py-3">
          <InlineOutputPreview content={runContent} title={issue.title} />
        </div>
      )}
    </div>
  );
}

// ── Document inline preview — scrollable, no nesting ───────────

function DocumentInlinePreview({ doc, issue }: { doc: { key: string; body: string; format?: string; title?: string | null }; issue: Issue }) {
  const [showFull, setShowFull] = useState(false);
  const isLong = doc.body.length > 3000;
  const previewLen = 3000;

  const displayBody = showFull || !isLong ? doc.body : doc.body.slice(0, previewLen);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Output da approvare
        </span>
        <Link
          to={`/issues/${issue.identifier ?? issue.id}`}
          className="text-[11px] text-blue-400 hover:underline"
        >
          Apri issue completa
        </Link>
      </div>
      <div className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "text-sm leading-relaxed",
        !showFull && isLong && "max-h-[400px] overflow-hidden relative",
      )}>
        <MarkdownBody>{displayBody}</MarkdownBody>
        {!showFull && isLong && (
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-amber-500/[0.03] to-transparent" />
        )}
      </div>
      {isLong && (
        <button
          type="button"
          className="mt-2 text-xs text-blue-400 hover:underline font-medium"
          onClick={() => setShowFull((v) => !v)}
        >
          {showFull ? "Mostra meno" : `Mostra tutto (${Math.round(doc.body.length / 1000)}k caratteri)`}
        </button>
      )}
    </div>
  );
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

  // Resolved issues (done/cancelled from formerly blocked)
  const resolvedBlockedIssues = useMemo(
    () =>
      issueList
        .filter((i) => i.status === "done" || i.status === "cancelled")
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 20),
    [issueList],
  );

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
                    {approvedApprovals.length > 0 && (
                      <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-500">
                        {approvedApprovals.length}
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
                    {rejectedApprovals.length > 0 && (
                      <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-500">
                        {rejectedApprovals.length}
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

      {/* ── Approval cards (not shown on "blocked" tab) ── */}
      {statusFilter !== "blocked" && filtered.length > 0 && (
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

      {/* ── Empty state ── */}
      {filtered.length === 0 &&
        (!showBlockedSection || blockedIssues.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {statusFilter === "pending"
                ? t("approval.noPending")
                : statusFilter === "blocked"
                  ? "Nessuna issue bloccata."
                  : statusFilter === "approved"
                    ? "Nessuna approvazione completata."
                    : statusFilter === "rejected"
                      ? "Nessuna richiesta rifiutata."
                      : t("approval.none")}
            </p>
          </div>
        )}
    </div>
  );
}
