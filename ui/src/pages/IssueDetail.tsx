import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { pickTextColorForPillBg } from "@/lib/color-contrast";
import { Link, useLocation, useNavigate, useParams } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { activityApi } from "../api/activity";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { usePanel } from "../context/PanelContext";
import { useToast } from "../context/ToastContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { assigneeValueFromSelection, suggestedCommentAssigneeValue } from "../lib/assignees";
import { queryKeys } from "../lib/queryKeys";
import { readIssueDetailBreadcrumb } from "../lib/issueDetailBreadcrumb";
import { useProjectOrder } from "../hooks/useProjectOrder";
import { relativeTime, cn, visibleRunCostUsd } from "../lib/utils";
import { estimateRunCostEur } from "../lib/modelPricing";
import { InlineEditor } from "../components/InlineEditor";
import { CommentThread } from "../components/CommentThread";
import { IssueDocumentsSection } from "../components/IssueDocumentsSection";
import { IssueProperties } from "../components/IssueProperties";
import { IssueWorkspaceCard } from "../components/IssueWorkspaceCard";
import { IssueActivityTab } from "../components/IssueActivityTab";
import { IssueResultsInline } from "../components/IssueResultsInline";
import { IssueReviewLayout } from "../components/IssueReviewLayout";
import { LiveRunWidget } from "../components/LiveRunWidget";
import type { MentionOption } from "../components/MarkdownEditor";
import { ScrollToBottom } from "../components/ScrollToBottom";
import { StatusIcon } from "../components/StatusIcon";
// PriorityIcon moved to side panel only
import { StatusBadge } from "../components/StatusBadge";
import { Identity } from "../components/Identity";
import { PluginSlotMount, PluginSlotOutlet, usePluginSlots } from "@/plugins/slots";
import { PluginLauncherOutlet } from "@/plugins/launchers";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity as ActivityIcon,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  EyeOff,
  FileText,
  Hexagon,
  // ListTree removed — sub-issues inline
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Repeat,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { Agent, IssueAttachment } from "@paperclipai/shared";

type CommentReassignment = {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
};


function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function usageNumber(usage: Record<string, unknown> | null, ...keys: string[]) {
  if (!usage) return 0;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

function isMarkdownFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    file.type === "text/markdown"
  );
}

function fileBaseName(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

function slugifyDocumentKey(input: string) {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "document";
}

function titleizeFilename(input: string) {
  return input
    .split(/[-_ ]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}


export function IssueDetail() {
  const { t } = useTranslation();
  const { issueId } = useParams<{ issueId: string }>();
  const { selectedCompanyId } = useCompany();
  const { openPanel, closePanel, panelVisible, setPanelVisible } = usePanel();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { pushToast } = useToast();
  const [moreOpen, setMoreOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobilePropsOpen, setMobilePropsOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("comments");
  const [secondaryOpen, setSecondaryOpen] = useState({
    approvals: false,
  });
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentDragActive, setAttachmentDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastMarkedReadIssueIdRef = useRef<string | null>(null);

  const { data: issue, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.detail(issueId!),
    queryFn: () => issuesApi.get(issueId!),
    enabled: !!issueId,
  });
  const resolvedCompanyId = issue?.companyId ?? selectedCompanyId;

  const { data: comments } = useQuery({
    queryKey: queryKeys.issues.comments(issueId!),
    queryFn: () => issuesApi.listComments(issueId!),
    enabled: !!issueId,
    refetchInterval: 60000, // fallback — WebSocket handles real-time invalidation
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.issues.activity(issueId!),
    queryFn: () => activityApi.forIssue(issueId!),
    enabled: !!issueId,
    refetchInterval: 60000, // fallback — WebSocket handles real-time invalidation
  });

  const { data: linkedRuns } = useQuery({
    queryKey: queryKeys.issues.runs(issueId!),
    queryFn: () => activityApi.runsForIssue(issueId!),
    enabled: !!issueId,
    refetchInterval: 5000,
  });

  const { data: linkedApprovals } = useQuery({
    queryKey: queryKeys.issues.approvals(issueId!),
    queryFn: () => issuesApi.listApprovals(issueId!),
    enabled: !!issueId,
  });

  const { data: attachments } = useQuery({
    queryKey: queryKeys.issues.attachments(issueId!),
    queryFn: () => issuesApi.listAttachments(issueId!),
    enabled: !!issueId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.issues.liveRuns(issueId!),
    queryFn: () => heartbeatsApi.liveRunsForIssue(issueId!),
    enabled: !!issueId,
    refetchInterval: 3000,
  });

  const { data: activeRun } = useQuery({
    queryKey: queryKeys.issues.activeRun(issueId!),
    queryFn: () => heartbeatsApi.activeRunForIssue(issueId!),
    enabled: !!issueId,
    refetchInterval: 3000,
  });

  const hasLiveRuns = (liveRuns ?? []).length > 0 || !!activeRun;
  const sourceBreadcrumb = useMemo(
    () => readIssueDetailBreadcrumb(location.state) ?? { label: "Issues", href: "/issues" },
    [location.state],
  );

  // Filter out runs already shown by the live widget to avoid duplication
  const timelineRuns = useMemo(() => {
    const liveIds = new Set<string>();
    for (const r of liveRuns ?? []) liveIds.add(r.id);
    if (activeRun) liveIds.add(activeRun.id);
    if (liveIds.size === 0) return linkedRuns ?? [];
    return (linkedRuns ?? []).filter((r) => !liveIds.has(r.runId));
  }, [linkedRuns, liveRuns, activeRun]);

  const { data: allIssues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const { orderedProjects } = useProjectOrder({
    projects: projects ?? [],
    companyId: selectedCompanyId,
    userId: currentUserId,
  });
  const { slots: issuePluginDetailSlots } = usePluginSlots({
    slotTypes: ["detailTab"],
    entityType: "issue",
    companyId: resolvedCompanyId,
    enabled: !!resolvedCompanyId,
  });
  const issuePluginTabItems = useMemo(
    () => issuePluginDetailSlots.map((slot) => ({
      value: `plugin:${slot.pluginKey}:${slot.id}`,
      label: slot.displayName,
      slot,
    })),
    [issuePluginDetailSlots],
  );
  const activePluginTab = issuePluginTabItems.find((item) => item.value === detailTab) ?? null;

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const mentionOptions = useMemo<MentionOption[]>(() => {
    const options: MentionOption[] = [];
    const activeAgents = [...(agents ?? [])]
      .filter((agent) => agent.status !== "terminated")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const agent of activeAgents) {
      options.push({
        id: `agent:${agent.id}`,
        name: agent.name,
        kind: "agent",
        agentId: agent.id,
        agentIcon: agent.icon,
      });
    }
    for (const project of orderedProjects) {
      options.push({
        id: `project:${project.id}`,
        name: project.name,
        kind: "project",
        projectId: project.id,
        projectColor: project.color,
      });
    }
    return options;
  }, [agents, orderedProjects]);

  const childIssues = useMemo(() => {
    if (!allIssues || !issue) return [];
    return allIssues
      .filter((i) => i.parentId === issue.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [allIssues, issue]);

  const commentReassignOptions = useMemo(() => {
    const options: Array<{ id: string; label: string; searchText?: string }> = [];
    const activeAgents = [...(agents ?? [])]
      .filter((agent) => agent.status !== "terminated")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const agent of activeAgents) {
      options.push({ id: `agent:${agent.id}`, label: agent.name });
    }
    if (currentUserId) {
      options.push({ id: `user:${currentUserId}`, label: "Me" });
    }
    return options;
  }, [agents, currentUserId]);

  const actualAssigneeValue = useMemo(
    () => assigneeValueFromSelection(issue ?? {}),
    [issue],
  );

  const suggestedAssigneeValue = useMemo(
    () => suggestedCommentAssigneeValue(issue ?? {}, comments, currentUserId),
    [issue, comments, currentUserId],
  );

  const commentsWithRunMeta = useMemo(() => {
    const runMetaByCommentId = new Map<string, { runId: string; runAgentId: string | null }>();
    const agentIdByRunId = new Map<string, string>();
    for (const run of linkedRuns ?? []) {
      agentIdByRunId.set(run.runId, run.agentId);
    }
    for (const evt of activity ?? []) {
      if (evt.action !== "issue.comment_added" || !evt.runId) continue;
      const details = evt.details ?? {};
      const commentId = typeof details["commentId"] === "string" ? details["commentId"] : null;
      if (!commentId || runMetaByCommentId.has(commentId)) continue;
      runMetaByCommentId.set(commentId, {
        runId: evt.runId,
        runAgentId: evt.agentId ?? agentIdByRunId.get(evt.runId) ?? null,
      });
    }
    return (comments ?? []).map((comment) => {
      const meta = runMetaByCommentId.get(comment.id);
      return meta ? { ...comment, ...meta } : comment;
    });
  }, [activity, comments, linkedRuns]);

  const issueCostSummary = useMemo(() => {
    let input = 0;
    let output = 0;
    let cached = 0;
    let cost = 0;
    let hasCost = false;
    let hasTokens = false;
    let estimatedEurTotal = 0;
    let canEstimate = true;
    const modelSet = new Set<string>();

    for (const run of linkedRuns ?? []) {
      const usage = asRecord(run.usageJson);
      const result = asRecord(run.resultJson);
      const runInput = usageNumber(usage, "inputTokens", "input_tokens");
      const runOutput = usageNumber(usage, "outputTokens", "output_tokens");
      const runCached = usageNumber(
        usage,
        "cachedInputTokens",
        "cached_input_tokens",
        "cache_read_input_tokens",
      );
      const runCost = visibleRunCostUsd(usage, result);
      const runModel = typeof (result?.model ?? usage?.model) === "string"
        ? String(result?.model ?? usage?.model)
        : "unknown";
      if (runCost > 0) hasCost = true;
      if (runInput + runOutput + runCached > 0) {
        hasTokens = true;
        if (runModel !== "unknown") modelSet.add(runModel);
        const eur = estimateRunCostEur(runModel, runInput, runOutput, runCached);
        if (eur === null) canEstimate = false;
        else estimatedEurTotal += eur;
      }
      input += runInput;
      output += runOutput;
      cached += runCached;
      cost += runCost;
    }

    return {
      input,
      output,
      cached,
      cost,
      totalTokens: input + output,
      hasCost,
      hasTokens,
      estimatedEur: !hasCost && canEstimate && hasTokens ? estimatedEurTotal : null,
      models: [...modelSet],
    };
  }, [linkedRuns]);

  // Extract completed run results for the Results tab
  const runResults = useMemo(() => {
    const results: Array<{
      runId: string;
      agentName: string;
      content: string;
      model: string;
      costUsd: number;
      finishedAt: string;
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
    }> = [];
    for (const run of linkedRuns ?? []) {
      if (run.status !== "succeeded") continue;
      const result = asRecord(run.resultJson);
      if (!result) continue;
      const content = typeof result.content === "string" ? result.content : null;
      if (!content || content.length === 0) continue;
      const usage = asRecord(run.usageJson);
      const agent = agentMap.get(run.agentId);
      results.push({
        runId: run.runId,
        agentName: agent?.name ?? run.agentId.slice(0, 8),
        content,
        model: typeof (result.model ?? usage?.model) === "string" ? (result.model ?? usage?.model) as string : "unknown",
        costUsd: visibleRunCostUsd(usage, result),
        finishedAt: run.finishedAt ?? run.createdAt,
        inputTokens: usageNumber(usage, "inputTokens", "input_tokens"),
        outputTokens: usageNumber(usage, "outputTokens", "output_tokens"),
        cachedTokens: usageNumber(usage, "cachedInputTokens", "cached_input_tokens", "cache_read_input_tokens"),
      });
    }
    return results;
  }, [linkedRuns, agentMap]);

  const invalidateIssue = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activity(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.runs(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.approvals(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.attachments(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.documents(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.liveRuns(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activeRun(issueId!) });
    if (selectedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listMineByMe(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listUnreadTouchedByMe(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId) });
    }
  };

  const markIssueRead = useMutation({
    mutationFn: (id: string) => issuesApi.markRead(id),
    onSuccess: () => {
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.listMineByMe(selectedCompanyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.listUnreadTouchedByMe(selectedCompanyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId) });
      }
    },
  });

  const updateIssue = useMutation({
    mutationFn: (data: Record<string, unknown>) => issuesApi.update(issueId!, data),
    onSuccess: () => {
      invalidateIssue();
    },
  });

  const addComment = useMutation({
    mutationFn: ({ body, reopen }: { body: string; reopen?: boolean }) =>
      issuesApi.addComment(issueId!, body, reopen),
    onSuccess: () => {
      invalidateIssue();
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId!) });
    },
  });

  const addCommentAndReassign = useMutation({
    mutationFn: ({
      body,
      reopen,
      reassignment,
    }: {
      body: string;
      reopen?: boolean;
      reassignment: CommentReassignment;
    }) =>
      issuesApi.update(issueId!, {
        comment: body,
        assigneeAgentId: reassignment.assigneeAgentId,
        assigneeUserId: reassignment.assigneeUserId,
        ...(reopen ? { status: "todo" } : {}),
      }),
    onSuccess: () => {
      invalidateIssue();
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId!) });
    },
  });

  const wakeupAgent = useMutation({
    mutationFn: (agentId: string) =>
      agentsApi.wakeup(
        agentId,
        { source: "on_demand", triggerDetail: "ping", reason: "Founder comment" },
        selectedCompanyId ?? undefined,
      ),
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return issuesApi.uploadAttachment(selectedCompanyId, issueId!, file);
    },
    onSuccess: () => {
      setAttachmentError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.attachments(issueId!) });
      invalidateIssue();
    },
    onError: (err) => {
      setAttachmentError(err instanceof Error ? err.message : "Upload failed");
    },
  });

  const importMarkdownDocument = useMutation({
    mutationFn: async (file: File) => {
      const baseName = fileBaseName(file.name);
      const key = slugifyDocumentKey(baseName);
      const existing = (issue?.documentSummaries ?? []).find((doc) => doc.key === key) ?? null;
      const body = await file.text();
      const inferredTitle = titleizeFilename(baseName);
      const nextTitle = existing?.title ?? inferredTitle ?? null;
      return issuesApi.upsertDocument(issueId!, key, {
        title: key === "plan" ? null : nextTitle,
        format: "markdown",
        body,
        baseRevisionId: existing?.latestRevisionId ?? null,
      });
    },
    onSuccess: () => {
      setAttachmentError(null);
      invalidateIssue();
    },
    onError: (err) => {
      setAttachmentError(err instanceof Error ? err.message : "Document import failed");
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => issuesApi.deleteAttachment(attachmentId),
    onSuccess: () => {
      setAttachmentError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.attachments(issueId!) });
      invalidateIssue();
    },
    onError: (err) => {
      setAttachmentError(err instanceof Error ? err.message : "Delete failed");
    },
  });

  useEffect(() => {
    const titleLabel = issue?.title ?? issueId ?? "Issue";
    setBreadcrumbs([
      sourceBreadcrumb,
      { label: hasLiveRuns ? `🔵 ${titleLabel}` : titleLabel },
    ]);
  }, [setBreadcrumbs, sourceBreadcrumb, issue, issueId, hasLiveRuns]);

  // Redirect to identifier-based URL if navigated via UUID
  useEffect(() => {
    if (issue?.identifier && issueId !== issue.identifier) {
      navigate(`/issues/${issue.identifier}`, { replace: true, state: location.state });
    }
  }, [issue, issueId, navigate, location.state]);

  useEffect(() => {
    if (!issue?.id) return;
    if (lastMarkedReadIssueIdRef.current === issue.id) return;
    lastMarkedReadIssueIdRef.current = issue.id;
    markIssueRead.mutate(issue.id);
  }, [issue?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (issue) {
      openPanel(
        <IssueProperties issue={issue} onUpdate={(data) => updateIssue.mutate(data)} />
      );
    }
    return () => closePanel();
  }, [issue]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyIssueToClipboard = async () => {
    if (!issue) return;
    const decodeEntities = (text: string) => {
      const el = document.createElement("textarea");
      el.innerHTML = text;
      return el.value;
    };
    const title = decodeEntities(issue.title);
    const body = decodeEntities(issue.description ?? "");
    const md = `# ${issue.identifier}: ${title}\n\n${body}`.trimEnd();
    await navigator.clipboard.writeText(md);
    setCopied(true);
    pushToast({ title: "Copied to clipboard", tone: "success" });
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("issueDetail.loading")}</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!issue) return null;

  // Ancestors are returned oldest-first from the server (root at end, immediate parent at start)
  const ancestors = issue.ancestors ?? [];
  const handleFilePicked = async (evt: ChangeEvent<HTMLInputElement>) => {
    const files = evt.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (isMarkdownFile(file)) {
        await importMarkdownDocument.mutateAsync(file);
      } else {
        await uploadAttachment.mutateAsync(file);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAttachmentDrop = async (evt: DragEvent<HTMLDivElement>) => {
    evt.preventDefault();
    setAttachmentDragActive(false);
    const files = evt.dataTransfer.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (isMarkdownFile(file)) {
        await importMarkdownDocument.mutateAsync(file);
      } else {
        await uploadAttachment.mutateAsync(file);
      }
    }
  };

  const isImageAttachment = (attachment: IssueAttachment) => attachment.contentType.startsWith("image/");
  const attachmentList = attachments ?? [];
  const hasAttachments = attachmentList.length > 0;
  const attachmentUploadButton = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,text/plain,text/markdown,application/json,text/csv,text/html,.md,.markdown"
        className="hidden"
        onChange={handleFilePicked}
        multiple
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadAttachment.isPending || importMarkdownDocument.isPending}
        className={cn(
          "shadow-none",
          attachmentDragActive && "border-primary bg-primary/5",
        )}
      >
        <Paperclip className="h-3.5 w-3.5 mr-1.5" />
        {uploadAttachment.isPending || importMarkdownDocument.isPending ? t("issueDetail.uploading") : (
          <>
            <span className="hidden sm:inline">{t("issueDetail.uploadAttachment")}</span>
            <span className="sm:hidden">{t("common.upload")}</span>
          </>
        )}
      </Button>
    </>
  );

  const assigneeAgent = issue.assigneeAgentId ? agentMap.get(issue.assigneeAgentId) : null;
  const isBlocked = issue.status === "blocked";
  const hasDocuments = (issue.documentSummaries ?? []).length > 0;
  const hasDocumentsOrResults = hasDocuments || runResults.length > 0;

  // ── Review mode: dedicated layout for blocked issues ──
  if (isBlocked) {
    return (
      <>
        <IssueReviewLayout
          issue={issue}
          agents={agents ?? []}
          agentMap={agentMap}
          comments={commentsWithRunMeta}
          childIssues={childIssues}
          onApprove={() => {
            issuesApi.addComment(issueId!, "Approvato dal founder.");
            updateIssue.mutate({ status: "done" });
          }}
          onReject={() => {
            issuesApi.addComment(issueId!, "Rifiutato dal founder.");
            updateIssue.mutate({ status: "cancelled" });
          }}
          onRevision={(feedback) => {
            const msg = feedback
              ? `Revisione richiesta dal founder.\n\n${feedback}`
              : "Revisione richiesta dal founder.";
            issuesApi.addComment(issueId!, msg);
            updateIssue.mutate({ status: "in_progress" });
          }}
          isPending={updateIssue.isPending}
        />

        {/* Mobile properties drawer */}
        <Sheet open={mobilePropsOpen} onOpenChange={setMobilePropsOpen}>
          <SheetContent side="bottom" className="max-h-[85dvh] pb-[env(safe-area-inset-bottom)]">
            <SheetHeader>
              <SheetTitle className="text-sm">Properties</SheetTitle>
            </SheetHeader>
            <ScrollArea className="flex-1 overflow-y-auto">
              <div className="px-4 pb-4">
                <IssueProperties issue={issue} onUpdate={(data) => updateIssue.mutate(data)} inline />
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Parent chain breadcrumb */}
      {ancestors.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
          {[...ancestors].reverse().map((ancestor, i) => (
            <span key={ancestor.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
              <Link
                to={`/issues/${ancestor.identifier ?? ancestor.id}`}
                state={location.state}
                className="hover:text-foreground transition-colors truncate max-w-[200px]"
                title={ancestor.title}
              >
                {ancestor.title}
              </Link>
            </span>
          ))}
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="text-foreground/60 truncate max-w-[200px]">{issue.title}</span>
        </nav>
      )}

      {issue.hiddenAt && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <EyeOff className="h-4 w-4 shrink-0" />
          {t("issueDetail.hidden")}
        </div>
      )}

      {/* ── Header: clean, minimal ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon
            status={issue.status}
            onChange={(status) => updateIssue.mutate({ status })}
          />
          <span className="text-sm font-mono text-muted-foreground shrink-0">{issue.identifier ?? issue.id.slice(0, 8)}</span>

          {hasLiveRuns && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-medium text-cyan-600 dark:text-cyan-400 shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
              </span>
              Live
            </span>
          )}

          {assigneeAgent && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Identity name={assigneeAgent.name} size="xs" />
              <span className="truncate max-w-[140px]">{assigneeAgent.name}</span>
            </span>
          )}

          <div className="ml-auto flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={copyIssueToClipboard}
              title="Copy issue as markdown"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(
                "shrink-0 transition-opacity duration-200 md:inline-flex",
                panelVisible ? "opacity-0 pointer-events-none w-0 overflow-hidden" : "opacity-100",
              )}
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobilePropsOpen(true);
                } else {
                  setPanelVisible(true);
                }
              }}
              title="Properties"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>

            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon-xs" className="shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="end">
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-destructive"
                  onClick={() => {
                    updateIssue.mutate(
                      { hiddenAt: new Date().toISOString() },
                      { onSuccess: () => navigate("/issues/all") },
                    );
                    setMoreOpen(false);
                  }}
                >
                  <EyeOff className="h-3 w-3" />
                  {t("issueDetail.hideIssue")}
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <InlineEditor
          value={issue.title}
          onSave={(title) => updateIssue.mutateAsync({ title })}
          as="h2"
          className="text-xl font-bold"
        />
      </div>

      {/* ── Action bar: prominent when blocked ── */}
      {isBlocked && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/[0.04] px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-400">Approvazione richiesta</p>
            {assigneeAgent && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Completata da {assigneeAgent.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => updateIssue.mutate({ status: "done" }, {
                onSuccess: () => {
                  issuesApi.addComment(issueId!, "Approvato dal founder.");
                },
              })}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Approva
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
              onClick={() => {
                issuesApi.addComment(issueId!, "Revisione richiesta dal founder.");
                updateIssue.mutate({ status: "in_progress" });
              }}
            >
              <Repeat className="h-3.5 w-3.5 mr-1" />
              Revisione
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => {
                issuesApi.addComment(issueId!, "Rifiutato dal founder.");
                updateIssue.mutate({ status: "cancelled" });
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Rifiuta
            </Button>
          </div>
        </div>
      )}

      {/* ── OUTPUT FIRST: Documents (the agent's deliverable) ── */}
      <IssueDocumentsSection
        issue={issue}
        canDeleteDocuments={Boolean(session?.user?.id)}
        mentions={mentionOptions}
        imageUploadHandler={async (file) => {
          const attachment = await uploadAttachment.mutateAsync(file);
          return attachment.contentPath;
        }}
        extraActions={!hasAttachments ? attachmentUploadButton : undefined}
      />

      {/* ── Results / Output — inline run results ── */}
      {runResults.length > 0 && (
        <IssueResultsInline runResults={runResults} />
      )}

      {/* ── Sub-issues — inline compact list ── */}
      {childIssues.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Sub-issue ({childIssues.length})
          </h3>
          <div className="border border-border rounded-lg divide-y divide-border">
            {childIssues.map((child) => (
              <Link
                key={child.id}
                to={`/issues/${child.identifier ?? child.id}`}
                state={location.state}
                className="flex items-center justify-between px-3 py-2 text-sm hover:bg-accent/20 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <StatusIcon status={child.status} />
                  <span className="font-mono text-muted-foreground shrink-0 text-xs">
                    {child.identifier ?? child.id.slice(0, 8)}
                  </span>
                  <span className="truncate">{child.title}</span>
                </div>
                {child.assigneeAgentId && (() => {
                  const name = agentMap.get(child.assigneeAgentId)?.name;
                  return name
                    ? <Identity name={name} size="sm" />
                    : null;
                })()}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Description (collapsible — this is the task spec, not the output) ── */}
      {issue.description && (
        <Collapsible defaultOpen={!hasDocumentsOrResults}>
          <CollapsibleTrigger className="flex w-full items-center gap-2 text-left group">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Briefing / Descrizione
            </h3>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <InlineEditor
              value={issue.description ?? ""}
              onSave={(description) => updateIssue.mutateAsync({ description })}
              as="p"
              className="text-[15px] leading-7 text-foreground"
              placeholder="Add a description..."
              multiline
              mentions={mentionOptions}
              imageUploadHandler={async (file) => {
                const attachment = await uploadAttachment.mutateAsync(file);
                return attachment.contentPath;
              }}
            />
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── Secondary: Comments & Activity tabs ── */}
      <Tabs value={detailTab} onValueChange={setDetailTab} className="space-y-3">
        <TabsList variant="line" className="w-full justify-start gap-1 sticky top-0 z-10 bg-background pb-1 overflow-x-auto flex-nowrap">
          <TabsTrigger value="comments" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            {t("issueDetail.comments")}
            {(commentsWithRunMeta.length > 0) && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {commentsWithRunMeta.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <ActivityIcon className="h-3.5 w-3.5" />
            {t("issueDetail.activity")}
          </TabsTrigger>
          {issuePluginTabItems.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="comments">
          <CommentThread
            comments={commentsWithRunMeta}
            linkedRuns={timelineRuns}
            companyId={issue.companyId}
            projectId={issue.projectId}
            issueStatus={issue.status}
            agentMap={agentMap}
            draftKey={`paperclip:issue-comment-draft:${issue.id}`}
            enableReassign
            reassignOptions={commentReassignOptions}
            currentAssigneeValue={actualAssigneeValue}
            suggestedAssigneeValue={suggestedAssigneeValue}
            mentions={mentionOptions}
            assignedAgentId={issue.assigneeAgentId ?? null}
            assignedAgentName={issue.assigneeAgentId ? (agentMap.get(issue.assigneeAgentId)?.name ?? null) : null}
            onWakeupAgent={async (agentId) => { await wakeupAgent.mutateAsync(agentId); }}
            onAdd={async (body, reopen, reassignment) => {
              if (reassignment) {
                await addCommentAndReassign.mutateAsync({ body, reopen, reassignment });
                return;
              }
              await addComment.mutateAsync({ body, reopen });
            }}
            imageUploadHandler={async (file) => {
              const attachment = await uploadAttachment.mutateAsync(file);
              return attachment.contentPath;
            }}
            onAttachImage={async (file) => {
              await uploadAttachment.mutateAsync(file);
            }}
            liveRunSlot={<LiveRunWidget issueId={issueId!} companyId={issue.companyId} />}
          />
        </TabsContent>

        <IssueActivityTab
          activity={activity}
          hasLinkedRuns={!!(linkedRuns && linkedRuns.length > 0)}
          issueCostSummary={issueCostSummary}
          agentMap={agentMap}
        />

        {activePluginTab && (
          <TabsContent value={activePluginTab.value}>
            <PluginSlotMount
              slot={activePluginTab.slot}
              context={{
                companyId: issue.companyId,
                projectId: issue.projectId ?? null,
                entityId: issue.id,
                entityType: "issue",
              }}
              missingBehavior="placeholder"
            />
          </TabsContent>
        )}
      </Tabs>

      <PluginSlotOutlet
        slotTypes={["toolbarButton", "contextMenuItem"]}
        entityType="issue"
        context={{
          companyId: issue.companyId,
          projectId: issue.projectId ?? null,
          entityId: issue.id,
          entityType: "issue",
        }}
        className="flex flex-wrap gap-2"
        itemClassName="inline-flex"
        missingBehavior="placeholder"
      />

      <PluginLauncherOutlet
        placementZones={["toolbarButton"]}
        entityType="issue"
        context={{
          companyId: issue.companyId,
          projectId: issue.projectId ?? null,
          entityId: issue.id,
          entityType: "issue",
        }}
        className="flex flex-wrap gap-2"
        itemClassName="inline-flex"
      />

      <PluginSlotOutlet
        slotTypes={["taskDetailView"]}
        entityType="issue"
        context={{
          companyId: issue.companyId,
          projectId: issue.projectId ?? null,
          entityId: issue.id,
          entityType: "issue",
        }}
        className="space-y-3"
        itemClassName="rounded-lg border border-border p-3"
        missingBehavior="placeholder"
      />

      {/* Documents section is now at the top — see "OUTPUT FIRST" block */}

      {hasAttachments ? (
        <div
        className={cn(
          "space-y-3 rounded-lg transition-colors",
        )}
        onDragEnter={(evt) => {
          evt.preventDefault();
          setAttachmentDragActive(true);
        }}
        onDragOver={(evt) => {
          evt.preventDefault();
          setAttachmentDragActive(true);
        }}
        onDragLeave={(evt) => {
          if (evt.currentTarget.contains(evt.relatedTarget as Node | null)) return;
          setAttachmentDragActive(false);
        }}
        onDrop={(evt) => void handleAttachmentDrop(evt)}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Attachments</h3>
          {attachmentUploadButton}
        </div>

        {attachmentError && (
          <p className="text-xs text-destructive">{attachmentError}</p>
        )}

        <div className="space-y-2">
          {attachmentList.map((attachment) => (
            <div key={attachment.id} className="border border-border rounded-md p-2">
              <div className="flex items-center justify-between gap-2">
                <a
                  href={attachment.contentPath}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs hover:underline truncate"
                  title={attachment.originalFilename ?? attachment.id}
                >
                  {attachment.originalFilename ?? attachment.id}
                </a>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => deleteAttachment.mutate(attachment.id)}
                  disabled={deleteAttachment.isPending}
                  title="Delete attachment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {attachment.contentType} · {(attachment.byteSize / 1024).toFixed(1)} KB
              </p>
              {isImageAttachment(attachment) && (
                <a href={attachment.contentPath} target="_blank" rel="noreferrer">
                  <img
                    src={attachment.contentPath}
                    alt={attachment.originalFilename ?? "attachment"}
                    className="mt-2 max-h-56 rounded border border-border object-contain bg-accent/10"
                    loading="lazy"
                  />
                </a>
              )}
            </div>
          ))}
        </div>
        </div>
      ) : null}

      <IssueWorkspaceCard
        issue={issue}
        project={orderedProjects.find((p) => p.id === issue.projectId) ?? null}
        onUpdate={(data) => updateIssue.mutate(data)}
      />

      {linkedApprovals && linkedApprovals.length > 0 && (
        <Collapsible
          open={secondaryOpen.approvals}
          onOpenChange={(open) => setSecondaryOpen((prev) => ({ ...prev, approvals: open }))}
          className="rounded-lg border border-border"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left">
            <span className="text-sm font-medium text-muted-foreground">
              Linked Approvals ({linkedApprovals.length})
            </span>
            <ChevronDown
              className={cn("h-4 w-4 text-muted-foreground transition-transform", secondaryOpen.approvals && "rotate-180")}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border divide-y divide-border">
              {linkedApprovals.map((approval) => (
                <Link
                  key={approval.id}
                  to={`/approvals/${approval.id}`}
                  className="flex items-center justify-between px-3 py-2 text-xs hover:bg-accent/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge status={approval.status} />
                    <span className="font-medium">
                      {approval.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                    <span className="font-mono text-muted-foreground">{approval.id.slice(0, 8)}</span>
                  </div>
                  <span className="text-muted-foreground">{relativeTime(approval.createdAt)}</span>
                </Link>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}


      {/* Mobile properties drawer */}
      <Sheet open={mobilePropsOpen} onOpenChange={setMobilePropsOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] pb-[env(safe-area-inset-bottom)]">
          <SheetHeader>
            <SheetTitle className="text-sm">Properties</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="px-4 pb-4">
              <IssueProperties issue={issue} onUpdate={(data) => updateIssue.mutate(data)} inline />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
      <ScrollToBottom />
    </div>
  );
}
