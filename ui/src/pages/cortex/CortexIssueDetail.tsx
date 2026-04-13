import { useState, useMemo, useCallback } from "react";
import { useParams, useOutletContext } from "@/lib/router";
import { useNavigate } from "@/lib/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { issuesApi } from "@/api/issues";
import { agentsApi } from "@/api/agents";
import { heartbeatsApi } from "@/api/heartbeats";
import { queryKeys } from "@/lib/queryKeys";
import { issueToV2Status, cortexStatusStyles } from "@/lib/cortex-status";
import { relativeTime, formatCents } from "@/lib/utils";
import { TopBar } from "@/components/cortex/TopBar";
import { MaskChat, type ChatMessage } from "@/components/cortex/MaskChat";
import { MaskDetails } from "@/components/cortex/MaskDetails";
import { MaskFiles, type MaskFile } from "@/components/cortex/MaskFiles";
import { AgentAvatar } from "@/components/cortex/AgentAvatar";
import { PageSkeleton } from "@/components/PageSkeleton";
import { cn } from "@/lib/utils";
import type { IssueComment, IssueAttachment } from "@paperclipai/shared";

type DetailTab = "chat" | "details" | "files";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In corso", todo: "Da fare", blocked: "Bloccato",
  in_review: "In review", done: "Fatto", cancelled: "Annullato", backlog: "Backlog",
};

export default function CortexIssueDetail() {
  const { issueId } = useParams<{ issueId: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { onMobileMenuOpen, onSearchOpen } = useOutletContext<{ onMobileMenuOpen?: () => void; onSearchOpen?: () => void }>();
  const [tab, setTab] = useState<DetailTab>("chat");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const issue = useMemo(
    () => (issues ?? []).find((i) => i.id === issueId) ?? null,
    [issues, issueId],
  );

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

  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: queryKeys.issues.comments(issueId!),
    queryFn: () => issuesApi.listComments(issueId!),
    enabled: !!issueId,
  });

  const { data: attachments } = useQuery({
    queryKey: queryKeys.issues.attachments(issueId!),
    queryFn: () => issuesApi.listAttachments(issueId!),
    enabled: !!issueId,
  });

  const agent = useMemo(() => {
    if (!issue?.assigneeAgentId || !agents) return null;
    return agents.find((a) => a.id === issue.assigneeAgentId) ?? null;
  }, [issue, agents]);

  const status = useMemo(() => {
    if (!issue) return "idle" as const;
    const hasLiveRun = (liveRuns ?? []).some((r) => r.issueId === issue.id);
    return issueToV2Status(issue.status, { isUnread: issue.isUnreadForMe, hasLiveRun });
  }, [issue, liveRuns]);

  const messages: ChatMessage[] = useMemo(
    () => (comments ?? []).map((c: IssueComment) => ({
      id: c.id,
      from: (c.authorAgentId ? "agent" : "ceo") as "agent" | "ceo",
      text: c.body,
      timestamp: new Date(c.createdAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    })),
    [comments],
  );

  const files: MaskFile[] = useMemo(
    () => (attachments ?? []).map((a: IssueAttachment) => {
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
    }),
    [attachments],
  );

  const liveRun = useMemo(
    () => issue ? (liveRuns ?? []).find((r) => r.issueId === issue.id) : null,
    [issue, liveRuns],
  );

  const metrics = useMemo(() => {
    const m: Array<{ label: string; value: string }> = [];
    if (liveRun) {
      m.push({ label: "Stato run", value: liveRun.status });
      if (liveRun.adapterType) m.push({ label: "Modello", value: liveRun.adapterType });
      if (liveRun.startedAt) {
        const elapsed = Math.round((Date.now() - new Date(liveRun.startedAt).getTime()) / 1000);
        m.push({ label: "Tempo", value: elapsed > 60 ? `${Math.round(elapsed / 60)}m` : `${elapsed}s` });
      }
    }
    if (agent) m.push({ label: "Spesa mese", value: formatCents(agent.spentMonthlyCents) });
    return m;
  }, [liveRun, agent]);

  // Actions
  const doSend = useCallback(async () => {
    if (!input.trim() || sending || !issueId) return;
    setSending(true);
    try {
      await issuesApi.addComment(issueId, input.trim());
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId) });
      setInput("");
    } finally {
      setSending(false);
    }
  }, [input, sending, issueId, queryClient]);

  const handleAction = useCallback(async (action: "approve" | "revise" | "reject") => {
    if (!issueId) return;
    try {
      const msg = action === "approve" ? "✅ Approvato dal CEO." : action === "revise" ? "🔄 Revisione richiesta dal CEO." : "❌ Rifiutato dal CEO.";
      const newStatus = action === "approve" ? "done" : action === "revise" ? "in_progress" : "cancelled";
      await issuesApi.addComment(issueId, msg, action === "revise");
      await issuesApi.update(issueId, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId) });
    } catch (e) {
      console.error("[Cortex] action failed:", e);
    }
  }, [issueId, selectedCompanyId, queryClient]);

  if (!issue) return <PageSkeleton variant="inbox" />;

  const s = cortexStatusStyles[status];
  const showActions = status === "needs-me";

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#060810] text-white">
      <TopBar
        title={issue.identifier ?? "Issue"}
        chip={STATUS_LABEL[issue.status]}
        onBack={() => navigate("../issues")}
        onMenuOpen={onMobileMenuOpen}
        onSearchOpen={onSearchOpen}
      />

      {/* Issue header */}
      <div className="flex items-start gap-4 border-b border-white/[0.06] px-4 py-4 md:px-7">
        {agent && <AgentAvatar name={agent.name} status={status} size="lg" />}
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold leading-[1.3] md:text-[18px]">{issue.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/45">
            {agent && <span>{agent.name}</span>}
            {agent?.title && <span className="text-white/30">· {agent.title}</span>}
            <span className="text-white/30">· {relativeTime(issue.updatedAt)}</span>
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium", s.bg, s.text)}>
              <span className={cn("h-[4px] w-[4px] rounded-full", s.dot)} />
              {STATUS_LABEL[issue.status]}
            </span>
          </div>
          {issue.description && (
            <p className="mt-2 text-[12px] leading-[1.6] text-white/50">{issue.description}</p>
          )}
        </div>
      </div>

      {/* Actions bar */}
      {showActions && (
        <div className="flex gap-2 border-b border-white/[0.06] px-4 py-2.5 md:px-7">
          <button onClick={() => handleAction("approve")} className="rounded-lg bg-[#6ee7b7] px-4 py-2 text-[12px] font-semibold text-[#0b0d15] transition-all hover:brightness-110">Approva</button>
          <button onClick={() => handleAction("revise")} className="rounded-lg border border-[rgba(252,211,77,0.15)] bg-[rgba(252,211,77,0.08)] px-4 py-2 text-[12px] font-semibold text-[#fcd34d] transition-all hover:bg-[rgba(252,211,77,0.14)]">Revisione</button>
          <button onClick={() => handleAction("reject")} className="rounded-lg border border-[rgba(252,165,165,0.15)] bg-[rgba(252,165,165,0.08)] px-4 py-2 text-[12px] font-semibold text-[#fca5a5] transition-all hover:bg-[rgba(252,165,165,0.14)]">Rifiuta</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-white/[0.06] px-4 md:px-7">
        {(["chat", "details", "files"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn(
            "mr-5 border-b-2 border-transparent py-2.5 text-[12px] font-medium text-white/45 transition-all hover:text-white/55",
            tab === t && "border-b-indigo-400 text-white",
          )}>
            {t === "chat" ? `Chat (${messages.length})` : t === "details" ? "Dettagli" : `File (${files.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "chat" && <MaskChat messages={messages} isLoading={commentsLoading} />}
        {tab === "details" && (
          <MaskDetails
            issueTitle={issue.title}
            issueIdentifier={issue.identifier ?? undefined}
            issueDescription={issue.description ?? undefined}
            issueStatus={issue.status}
            agentStatus={status}
            metrics={metrics.length > 0 ? metrics : undefined}
          />
        )}
        {tab === "files" && <MaskFiles files={files} />}
      </div>

      {/* Input */}
      <div className="flex gap-2 border-t border-white/[0.06] px-4 py-3 md:px-7">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") doSend(); }}
          placeholder={`Scrivi a ${agent?.name ?? "agente"}...`}
          className="flex-1 rounded-lg border border-white/[0.06] bg-[#161a27] px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-white/45 focus:border-indigo-400"
          disabled={sending}
        />
        <button
          onClick={doSend}
          disabled={sending || !input.trim()}
          className={cn("rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-all", sending ? "opacity-50 cursor-wait" : "hover:brightness-[1.15]")}
        >
          {sending ? "..." : "Invia"}
        </button>
      </div>
    </div>
  );
}
