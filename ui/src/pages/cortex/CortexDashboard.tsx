import { useState, useMemo, useCallback } from "react";
import { useOutletContext } from "@/lib/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { agentsApi } from "@/api/agents";
import { issuesApi } from "@/api/issues";
import { heartbeatsApi } from "@/api/heartbeats";
import { dashboardApi } from "@/api/dashboard";
import { queryKeys } from "@/lib/queryKeys";
import { issueToV2Status } from "@/lib/cortex-status";
import { projectsApi } from "@/api/projects";
import { formatCents } from "@/lib/utils";
import { TopBar } from "@/components/cortex/TopBar";
import { NetworkGraph } from "@/components/cortex/NetworkGraph";
import { InteractionMask } from "@/components/cortex/InteractionMask";
import type { MaskData } from "@/components/cortex/InteractionMask";
import type { ChatMessage } from "@/components/cortex/MaskChat";
import type { MaskFile } from "@/components/cortex/MaskFiles";
import type { AgentNodeData } from "@/components/cortex/AgentNode";
import { PageSkeleton } from "@/components/PageSkeleton";
import type { IssueComment, IssueAttachment } from "@paperclipai/shared";

interface CortexOutletContext {
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
}

export default function CortexDashboard() {
  const { selectedProjectId: projectId, setSelectedProjectId } = useOutletContext<CortexOutletContext>();
  const { selectedCompanyId } = useCompany();
  const [maskOpen, setMaskOpen] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: allIssues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 8_000,
  });

  const { data: summary } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // ── Issue details (comments + attachments) for the mask ──

  const { data: issueComments, isLoading: commentsLoading } = useQuery({
    queryKey: queryKeys.issues.comments(selectedIssueId!),
    queryFn: () => issuesApi.listComments(selectedIssueId!),
    enabled: !!selectedIssueId,
  });

  const { data: issueAttachments } = useQuery({
    queryKey: queryKeys.issues.attachments(selectedIssueId!),
    queryFn: () => issuesApi.listAttachments(selectedIssueId!),
    enabled: !!selectedIssueId,
  });

  const liveRunAgentIds = useMemo(
    () => new Set((liveRuns ?? []).map((r) => r.agentId)),
    [liveRuns],
  );
  const liveIssueIds = useMemo(
    () => new Set((liveRuns ?? []).filter((r) => r.issueId).map((r) => r.issueId!)),
    [liveRuns],
  );

  const agentMap = useMemo(() => {
    const m = new Map<string, { name: string; title?: string | null; icon?: string | null; adapterType: string; spentMonthlyCents: number; status: string }>();
    for (const a of agents ?? []) m.set(a.id, a);
    return m;
  }, [agents]);

  // ── Graph nodes: depends on whether a project is selected ──

  const graphNodes: AgentNodeData[] = useMemo(() => {
    if (!projectId) {
      // No project selected → show PROJECTS as nodes
      const activeProjects = (projects ?? []).filter((p) => !p.archivedAt);
      const issues = allIssues ?? [];

      return activeProjects.map((p) => {
        const projIssues = issues.filter((i) => i.projectId === p.id);
        const hasBlocked = projIssues.some((i) => i.status === "blocked" || i.status === "in_review");
        const hasActive = projIssues.some((i) => i.status === "in_progress" || i.status === "todo");
        const allDone = projIssues.length > 0 && projIssues.every((i) => i.status === "done" || i.status === "cancelled");
        const hasError = projIssues.some((i) => {
          if (!i.assigneeAgentId) return false;
          const agent = agentMap.get(i.assigneeAgentId);
          return agent?.status === "error";
        });

        let status: AgentNodeData["status"] = "idle";
        if (hasBlocked) status = "needs-me";
        else if (hasError) status = "error";
        else if (hasActive) status = "working";
        else if (allDone) status = "done";

        const activeCount = projIssues.filter((i) => i.status === "in_progress" || i.status === "todo" || i.status === "blocked" || i.status === "in_review").length;

        return {
          id: p.id,
          name: p.name,
          role: activeCount > 0 ? `${activeCount} task attiv${activeCount === 1 ? "o" : "i"}` : undefined,
          status,
          color: p.color ?? "#6366f1",
        };
      });
    }

    // Project selected → show only ACTIVE tasks (not done/cancelled/backlog)
    const projectIssues = (allIssues ?? []).filter(
      (i) => i.projectId === projectId &&
        i.status !== "backlog" &&
        i.status !== "cancelled" &&
        i.status !== "done",
    );

    return projectIssues.map((issue) => {
      const agent = issue.assigneeAgentId ? agentMap.get(issue.assigneeAgentId) : null;
      const status = issueToV2Status(issue.status, {
        isUnread: issue.isUnreadForMe,
        hasLiveRun: liveIssueIds.has(issue.id),
      });

      return {
        id: issue.id,
        name: issue.title.length > 25 ? issue.title.slice(0, 22) + "..." : issue.title,
        icon: agent?.icon ?? undefined,
        role: agent?.name ?? "Non assegnato",
        currentTask: issue.identifier ?? undefined,
        status,
      };
    });
  }, [projectId, projects, allIssues, agentMap, liveIssueIds]);

  // ── KPIs ──

  const pendingDecisions = useMemo(() => {
    const issues = projectId
      ? (allIssues ?? []).filter((i) => i.projectId === projectId)
      : (allIssues ?? []);
    return issues.filter((i) => i.status === "blocked" || i.status === "in_review").length;
  }, [allIssues, projectId]);

  const activeTasks = useMemo(() => {
    const issues = projectId
      ? (allIssues ?? []).filter((i) => i.projectId === projectId)
      : (allIssues ?? []);
    return issues.filter((i) => i.status === "in_progress" || i.status === "todo").length;
  }, [allIssues, projectId]);

  const todayCost = summary?.costs?.monthSpendCents ?? 0;

  // ── Selected project name for topbar ──
  const selectedProjectName = projectId
    ? (projects ?? []).find((p) => p.id === projectId)?.name ?? "Progetto"
    : "Cortex";

  // ── Helpers ──

  function commentToMessage(c: IssueComment): ChatMessage {
    const isAgent = !!c.authorAgentId;
    const agent = c.authorAgentId ? agentMap.get(c.authorAgentId) : null;
    const d = new Date(c.createdAt);
    return {
      id: c.id,
      from: isAgent ? "agent" : "ceo",
      text: c.body,
      timestamp: d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    };
  }

  function attachmentToFile(a: IssueAttachment): MaskFile {
    const ext = (a.originalFilename ?? a.objectKey).split(".").pop()?.toLowerCase() ?? "";
    const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
    const isPdf = ext === "pdf";
    const d = new Date(a.createdAt);
    return {
      icon: isImage ? "🖼" : isPdf ? "📄" : "📎",
      name: a.originalFilename ?? a.objectKey,
      meta: `${(a.byteSize / 1024).toFixed(0)} KB`,
      time: d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      action: "open" as const,
      href: a.contentPath,
    };
  }

  // ── Build mask data reactively from selected issue + fetched comments/attachments ──

  const selectedIssue = useMemo(
    () => selectedIssueId ? (allIssues ?? []).find((i) => i.id === selectedIssueId) ?? null : null,
    [selectedIssueId, allIssues],
  );

  const maskData: MaskData | null = useMemo(() => {
    if (!selectedIssue) return null;

    const agent = selectedIssue.assigneeAgentId ? agentMap.get(selectedIssue.assigneeAgentId) : null;
    const status = issueToV2Status(selectedIssue.status, {
      isUnread: selectedIssue.isUnreadForMe,
      hasLiveRun: liveIssueIds.has(selectedIssue.id),
    });

    const messages: ChatMessage[] = (issueComments ?? []).map(commentToMessage);
    const files: MaskFile[] = (issueAttachments ?? []).map(attachmentToFile);

    // Metrics from live run if active
    const liveRun = (liveRuns ?? []).find((r) => r.issueId === selectedIssue.id);
    const metrics: Array<{ label: string; value: string }> = [];
    if (liveRun) {
      metrics.push({ label: "Stato run", value: liveRun.status });
      if (liveRun.adapterType) metrics.push({ label: "Modello", value: liveRun.adapterType });
      if (liveRun.startedAt) {
        const elapsed = Math.round((Date.now() - new Date(liveRun.startedAt).getTime()) / 1000);
        metrics.push({ label: "Tempo", value: elapsed > 60 ? `${Math.round(elapsed / 60)}m` : `${elapsed}s` });
      }
    }
    if (agent) {
      metrics.push({ label: "Spesa mese", value: formatCents(agent.spentMonthlyCents) });
    }

    return {
      issueId: selectedIssue.id,
      issueIdentifier: selectedIssue.identifier ?? undefined,
      issueTitle: selectedIssue.title,
      issueDescription: selectedIssue.description ?? undefined,
      issueStatus: selectedIssue.status,
      agentId: selectedIssue.assigneeAgentId ?? "",
      agentName: agent?.name ?? "Non assegnato",
      agentRole: agent?.title ?? undefined,
      agentStatus: status,
      projectName: selectedProjectName,
      modelTag: agent?.adapterType,
      costTag: agent ? formatCents(agent.spentMonthlyCents) : undefined,
      requestMessage:
        status === "needs-me"
          ? `Azione richiesta su "${selectedIssue.title}"`
          : undefined,
      messages,
      files,
      metrics: metrics.length > 0 ? metrics : undefined,
    };
  }, [selectedIssue, agentMap, liveIssueIds, issueComments, issueAttachments, liveRuns, selectedProjectName]);

  // ── Click handler ──

  const handleNodeClick = useCallback((nodeId: string) => {
    if (!projectId) {
      // Clicked a project node → select it to drill into tasks
      setSelectedProjectId(nodeId);
      return;
    }

    // Clicked a task node → open mask
    setSelectedIssueId(nodeId);
    setMaskOpen(true);
  }, [projectId, setSelectedProjectId]);

  // ── Mask actions ──

  const handleSendMessage = useCallback(async (text: string) => {
    if (!selectedIssueId) return;
    try {
      await issuesApi.addComment(selectedIssueId, text);
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(selectedIssueId) });
    } catch (e) {
      console.error("[Cortex] handleSendMessage failed:", e);
    }
  }, [selectedIssueId, queryClient]);

  const handleApprove = useCallback(async () => {
    if (!selectedIssueId) return;
    try {
      await issuesApi.addComment(selectedIssueId, "✅ Approvato dal CEO.");
      await issuesApi.update(selectedIssueId, { status: "done" });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(selectedIssueId) });
      setMaskOpen(false);
    } catch (e) {
      console.error("[Cortex] handleApprove failed:", e);
    }
  }, [selectedIssueId, selectedCompanyId, queryClient]);

  const handleRevise = useCallback(async () => {
    if (!selectedIssueId) return;
    try {
      await issuesApi.addComment(selectedIssueId, "🔄 Revisione richiesta dal CEO.", true);
      await issuesApi.update(selectedIssueId, { status: "in_progress" });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(selectedIssueId) });
      setMaskOpen(false);
    } catch (e) {
      console.error("[Cortex] handleRevise failed:", e);
    }
  }, [selectedIssueId, selectedCompanyId, queryClient]);

  const handleReject = useCallback(async () => {
    if (!selectedIssueId) return;
    try {
      await issuesApi.addComment(selectedIssueId, "❌ Rifiutato dal CEO.");
      await issuesApi.update(selectedIssueId, { status: "cancelled" });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(selectedIssueId) });
      setMaskOpen(false);
    } catch (e) {
      console.error("[Cortex] handleReject failed:", e);
    }
  }, [selectedIssueId, selectedCompanyId, queryClient]);

  const handleCloseMask = useCallback(() => {
    setMaskOpen(false);
    // Mark as read when closing
    if (selectedIssueId) issuesApi.markRead(selectedIssueId).catch(() => {});
  }, [selectedIssueId]);

  if (agentsLoading) return <PageSkeleton variant="dashboard" />;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#060810] text-white">
      <TopBar
        title={selectedProjectName}
        chip={projectId ? `${graphNodes.length} task` : `${graphNodes.length} progetti`}
        kpis={[
          { value: String(pendingDecisions), label: "decisioni", hot: pendingDecisions > 0 },
          { value: String(activeTasks), label: "task attivi" },
          { value: formatCents(todayCost), label: "spesa mese" },
        ]}
        onBack={projectId ? () => setSelectedProjectId(null) : undefined}
      />

      <NetworkGraph agents={graphNodes} onAgentClick={handleNodeClick} />

      <InteractionMask
        open={maskOpen}
        data={maskData}
        chatLoading={commentsLoading}
        onClose={handleCloseMask}
        onApprove={handleApprove}
        onRevise={handleRevise}
        onReject={handleReject}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}
