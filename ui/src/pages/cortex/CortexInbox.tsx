import { useMemo, useState, useCallback } from "react";
import { useOutletContext } from "@/lib/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { issuesApi } from "@/api/issues";
import { agentsApi } from "@/api/agents";
import { heartbeatsApi } from "@/api/heartbeats";
import { queryKeys } from "@/lib/queryKeys";
import { issueToV2Status } from "@/lib/cortex-status";
import { relativeTime, formatCents } from "@/lib/utils";
import { TopBar } from "@/components/cortex/TopBar";
import { InboxSection } from "@/components/cortex/InboxSection";
import { InboxItem } from "@/components/cortex/InboxItem";
import { InteractionMask } from "@/components/cortex/InteractionMask";
import type { MaskData } from "@/components/cortex/InteractionMask";
import type { ChatMessage } from "@/components/cortex/MaskChat";
import type { MaskFile } from "@/components/cortex/MaskFiles";
import { PageSkeleton } from "@/components/PageSkeleton";
import type { Issue, IssueComment, IssueAttachment } from "@paperclipai/shared";
import type { CortexStatus } from "@/lib/cortex-status";

interface CategorizedIssue {
  issue: Issue;
  status: CortexStatus;
  agentName: string;
}

export default function CortexInbox() {
  const { selectedCompanyId } = useCompany();
  const { selectedProjectId } = useOutletContext<{ selectedProjectId: string | null }>();
  const [maskOpen, setMaskOpen] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: issues, isLoading: issuesLoading } = useQuery({
    queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId!),
    queryFn: () =>
      issuesApi.list(selectedCompanyId!, { touchedByUserId: "me" }),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 8_000,
  });

  const agentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents ?? []) {
      map.set(a.id, a.name);
    }
    return map;
  }, [agents]);

  const liveRunIssueIds = useMemo(
    () =>
      new Set(
        (liveRuns ?? [])
          .filter((r) => r.issueId)
          .map((r) => r.issueId as string),
      ),
    [liveRuns],
  );

  const categorized = useMemo(() => {
    if (!issues) return { urgent: [], working: [], archive: [] };

    const urgent: CategorizedIssue[] = [];
    const working: CategorizedIssue[] = [];
    const archive: CategorizedIssue[] = [];

    const filtered = selectedProjectId ? issues.filter((i) => i.projectId === selectedProjectId) : issues;

    for (const issue of filtered) {
      const status = issueToV2Status(issue.status, {
        isUnread: issue.isUnreadForMe ?? false,
        hasLiveRun: liveRunIssueIds.has(issue.id),
      });

      const agentName = issue.assigneeAgentId
        ? agentMap.get(issue.assigneeAgentId) ?? "Agent"
        : "Unassigned";

      const item: CategorizedIssue = { issue, status, agentName };

      if (status === "needs-me") {
        urgent.push(item);
      } else if (status === "working") {
        working.push(item);
      } else {
        archive.push(item);
      }
    }

    return { urgent, working, archive };
  }, [issues, liveRunIssueIds, agentMap, selectedProjectId]);

  // ── Issue details for mask ──

  const { data: issueComments } = useQuery({
    queryKey: queryKeys.issues.comments(selectedIssueId!),
    queryFn: () => issuesApi.listComments(selectedIssueId!),
    enabled: !!selectedIssueId,
  });

  const { data: issueAttachments } = useQuery({
    queryKey: queryKeys.issues.attachments(selectedIssueId!),
    queryFn: () => issuesApi.listAttachments(selectedIssueId!),
    enabled: !!selectedIssueId,
  });

  const agentFullMap = useMemo(() => {
    const m = new Map<string, { name: string; title?: string | null; spentMonthlyCents: number; adapterType: string }>();
    for (const a of agents ?? []) m.set(a.id, a);
    return m;
  }, [agents]);

  const selectedIssue = useMemo(
    () => selectedIssueId ? (issues ?? []).find((i) => i.id === selectedIssueId) ?? null : null,
    [selectedIssueId, issues],
  );

  const maskData: MaskData | null = useMemo(() => {
    if (!selectedIssue) return null;
    const agent = selectedIssue.assigneeAgentId ? agentFullMap.get(selectedIssue.assigneeAgentId) : null;
    const status = issueToV2Status(selectedIssue.status, {
      isUnread: selectedIssue.isUnreadForMe ?? false,
      hasLiveRun: liveRunIssueIds.has(selectedIssue.id),
    });
    const messages: ChatMessage[] = (issueComments ?? []).map((c: IssueComment) => ({
      id: c.id,
      from: (c.authorAgentId ? "agent" : "ceo") as "agent" | "ceo",
      text: c.body,
      timestamp: new Date(c.createdAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    }));
    const files: MaskFile[] = (issueAttachments ?? []).map((a: IssueAttachment) => {
      const ext = (a.originalFilename ?? a.objectKey).split(".").pop()?.toLowerCase() ?? "";
      const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
      return {
        icon: isImage ? "🖼" : "📎",
        name: a.originalFilename ?? a.objectKey,
        meta: `${(a.byteSize / 1024).toFixed(0)} KB`,
        time: new Date(a.createdAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
        action: "open" as const,
        href: a.contentPath,
      };
    });
    const liveRun = (liveRuns ?? []).find((r) => r.issueId === selectedIssue.id);
    const metrics: Array<{ label: string; value: string }> = [];
    if (liveRun) {
      metrics.push({ label: "Stato run", value: liveRun.status });
      if (liveRun.adapterType) metrics.push({ label: "Modello", value: liveRun.adapterType });
    }
    if (agent) metrics.push({ label: "Spesa mese", value: formatCents(agent.spentMonthlyCents) });

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
      modelTag: agent?.adapterType,
      costTag: agent ? formatCents(agent.spentMonthlyCents) : undefined,
      requestMessage: status === "needs-me" ? `Azione richiesta su "${selectedIssue.title}"` : undefined,
      messages,
      files,
      metrics: metrics.length > 0 ? metrics : undefined,
    };
  }, [selectedIssue, agentFullMap, liveRunIssueIds, issueComments, issueAttachments, liveRuns]);

  const handleItemClick = useCallback((issueId: string) => {
    setSelectedIssueId(issueId);
    setMaskOpen(true);
  }, []);

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
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId!) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId!) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(selectedIssueId) });
      setMaskOpen(false);
    } catch (e) {
      console.error("[Cortex] handleReject failed:", e);
    }
  }, [selectedIssueId, selectedCompanyId, queryClient]);

  const handleCloseMask = useCallback(() => {
    setMaskOpen(false);
    if (selectedIssueId) issuesApi.markRead(selectedIssueId).catch(() => {});
  }, [selectedIssueId]);

  if (issuesLoading) return <PageSkeleton variant="inbox" />;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0b0d15] text-white">
      <TopBar
        title="Inbox"
        kpis={[
          {
            value: String(categorized.urgent.length),
            label: "urgenti",
            hot: categorized.urgent.length > 0,
          },
          { value: String(categorized.working.length), label: "in corso" },
        ]}
      />

      <div className="flex-1 overflow-y-auto pb-8">
        {categorized.urgent.length > 0 && (
          <InboxSection
            title="Urgente"
            count={categorized.urgent.length}
            color="#fcd34d"
          >
            {categorized.urgent.map((item) => (
              <InboxItem
                key={item.issue.id}
                agentName={item.agentName}
                agentStatus={item.status}
                title={item.issue.title}
                subtitle={item.agentName}
                time={relativeTime(item.issue.updatedAt)}
                action={{ label: "Rispondi", variant: "look" }}
                onClick={() => handleItemClick(item.issue.id)}
              />
            ))}
          </InboxSection>
        )}

        {categorized.working.length > 0 && (
          <InboxSection
            title="In corso"
            count={categorized.working.length}
            color="#67e8f9"
          >
            {categorized.working.map((item) => (
              <InboxItem
                key={item.issue.id}
                agentName={item.agentName}
                agentStatus={item.status}
                title={item.issue.title}
                subtitle={item.agentName}
                time={relativeTime(item.issue.updatedAt)}
                onClick={() => handleItemClick(item.issue.id)}
              />
            ))}
          </InboxSection>
        )}

        {categorized.archive.length > 0 && (
          <InboxSection
            title="Archivio"
            count={categorized.archive.length}
            color="#6ee7b7"
            muted
          >
            {categorized.archive.map((item) => (
              <InboxItem
                key={item.issue.id}
                agentName={item.agentName}
                agentStatus={item.status}
                title={item.issue.title}
                subtitle={item.agentName}
                time={relativeTime(item.issue.updatedAt)}
                onClick={() => handleItemClick(item.issue.id)}
              />
            ))}
          </InboxSection>
        )}

        {!issues?.length && (
          <div className="flex flex-col items-center justify-center gap-2 pt-32 text-white/30">
            <span className="text-[40px]">&#x1F4ED;</span>
            <span className="text-[14px]">Nessun task in inbox</span>
          </div>
        )}
      </div>

      <InteractionMask
        open={maskOpen}
        data={maskData}
        onClose={handleCloseMask}
        onApprove={handleApprove}
        onRevise={handleRevise}
        onReject={handleReject}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}
