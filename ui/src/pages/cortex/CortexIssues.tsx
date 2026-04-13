import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useOutletContext, useNavigate } from "@/lib/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { issuesApi } from "@/api/issues";
import { agentsApi } from "@/api/agents";
import { heartbeatsApi } from "@/api/heartbeats";
import { queryKeys } from "@/lib/queryKeys";
import { issueToV2Status } from "@/lib/cortex-status";
import { cortexStatusStyles } from "@/lib/cortex-status";
import { relativeTime, formatCents } from "@/lib/utils";
import { TopBar } from "@/components/cortex/TopBar";
import { AgentAvatar } from "@/components/cortex/AgentAvatar";
import { InteractionMask } from "@/components/cortex/InteractionMask";
import type { MaskData } from "@/components/cortex/InteractionMask";
import type { ChatMessage } from "@/components/cortex/MaskChat";
import type { MaskFile } from "@/components/cortex/MaskFiles";
import { PageSkeleton } from "@/components/PageSkeleton";
import { cn } from "@/lib/utils";
import type { CortexStatus } from "@/lib/cortex-status";
import type { IssueComment, IssueAttachment } from "@paperclipai/shared";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In corso",
  todo: "Da fare",
  blocked: "Bloccato",
  in_review: "In review",
  done: "Fatto",
  cancelled: "Annullato",
  backlog: "Backlog",
};

export default function CortexIssues() {
  const { selectedCompanyId } = useCompany();
  const { selectedProjectId, onMobileMenuOpen, onSearchOpen } = useOutletContext<{ selectedProjectId: string | null; onMobileMenuOpen?: () => void; onSearchOpen?: () => void }>();
  const [maskOpen, setMaskOpen] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const dragSrcId = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: issues, isLoading } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
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

  const agentMap = useMemo(() => {
    const m = new Map<string, { name: string; title?: string | null; spentMonthlyCents: number; adapterType: string }>();
    for (const a of agents ?? []) m.set(a.id, a);
    return m;
  }, [agents]);

  const liveRunIssueIds = useMemo(
    () => new Set((liveRuns ?? []).filter((r) => r.issueId).map((r) => r.issueId as string)),
    [liveRuns],
  );

  const filtered = useMemo(() => {
    const all = issues ?? [];
    return selectedProjectId ? all.filter((i) => i.projectId === selectedProjectId) : all;
  }, [issues, selectedProjectId]);

  const searched = useMemo(() => {
    if (!search.trim()) return filtered;
    const q = search.toLowerCase();
    return filtered.filter((i) =>
      i.title.toLowerCase().includes(q) ||
      (i.identifier ?? "").toLowerCase().includes(q) ||
      (i.assigneeAgentId && agentMap.get(i.assigneeAgentId)?.name.toLowerCase().includes(q)),
    );
  }, [filtered, search, agentMap]);

  const defaultSorted = useMemo(() => {
    const order: Record<string, number> = { blocked: 0, in_review: 1, in_progress: 2, todo: 3, backlog: 4, done: 5, cancelled: 6 };
    return [...searched].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  }, [searched]);

  // Apply manual drag order if present (only when no search active)
  const sorted = useMemo(() => {
    if (!dragOrder || search.trim()) return defaultSorted;
    const map = new Map(defaultSorted.map((i) => [i.id, i]));
    const ordered = dragOrder.map((id) => map.get(id)).filter(Boolean) as typeof defaultSorted;
    // Append any new issues not in dragOrder
    for (const i of defaultSorted) if (!dragOrder.includes(i.id)) ordered.push(i);
    return ordered;
  }, [defaultSorted, dragOrder, search]);

  const counts = useMemo(() => {
    const c = { active: 0, blocked: 0, done: 0 };
    for (const i of filtered) {
      if (i.status === "blocked" || i.status === "in_review") c.blocked++;
      else if (i.status === "in_progress" || i.status === "todo") c.active++;
      else if (i.status === "done") c.done++;
    }
    return c;
  }, [issues]);

  // ── Mask data ──

  const selectedIssue = useMemo(
    () => selectedIssueId ? (issues ?? []).find((i) => i.id === selectedIssueId) ?? null : null,
    [selectedIssueId, issues],
  );

  const maskData: MaskData | null = useMemo(() => {
    if (!selectedIssue) return null;
    const agent = selectedIssue.assigneeAgentId ? agentMap.get(selectedIssue.assigneeAgentId) : null;
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
  }, [selectedIssue, agentMap, liveRunIssueIds, issueComments, issueAttachments, liveRuns]);

  // ── Actions ──

  const handleRowClick = useCallback((issueId: string) => {
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

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusDropdownId) return;
    const handler = () => setStatusDropdownId(null);
    // Defer to avoid closing on the same click that opened it
    const timer = setTimeout(() => window.addEventListener("click", handler), 0);
    return () => { clearTimeout(timer); window.removeEventListener("click", handler); };
  }, [statusDropdownId]);

  const handleQuickStatus = useCallback(async (issueId: string, newStatus: string) => {
    setStatusDropdownId(null);
    try {
      await issuesApi.update(issueId, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
    } catch (e) {
      console.error("[Cortex] quickStatus failed:", e);
    }
  }, [selectedCompanyId, queryClient]);

  const handleBulkAction = useCallback(async (newStatus: string) => {
    if (selected.size === 0) return;
    const msg = newStatus === "done" ? "✅ Approvato dal CEO (bulk)." : newStatus === "cancelled" ? "❌ Rifiutato dal CEO (bulk)." : "🔄 Revisione richiesta (bulk).";
    try {
      await Promise.all([...selected].map(async (id) => {
        await issuesApi.addComment(id, msg, newStatus === "in_progress");
        await issuesApi.update(id, { status: newStatus });
      }));
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      setSelected(new Set());
    } catch (e) {
      console.error("[Cortex] bulkAction failed:", e);
    }
  }, [selected, selectedCompanyId, queryClient]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map((i) => i.id)));
  }, [selected.size, sorted]);

  const handleCloseMask = useCallback(() => {
    setMaskOpen(false);
    if (selectedIssueId) issuesApi.markRead(selectedIssueId).catch(() => {});
  }, [selectedIssueId]);

  if (isLoading) return <PageSkeleton variant="inbox" />;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#060810] text-white">
      <TopBar
        title="Issues"
        chip={`${sorted.length} totali`}
        kpis={[
          { value: String(counts.blocked), label: "bloccati", hot: counts.blocked > 0 },
          { value: String(counts.active), label: "attivi" },
          { value: String(counts.done), label: "completati" },
        ]}
        onMenuOpen={onMobileMenuOpen}
        onSearchOpen={onSearchOpen}
      />

      {/* Search */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-2">
        <svg className="h-3.5 w-3.5 text-white/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per titolo, ID o agente..."
          className="flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/30"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-[10px] text-white/35 hover:text-white/60">✕</button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 border-b border-indigo-400/[0.15] bg-indigo-400/[0.06] px-4 py-2 md:px-5">
          <span className="text-[11px] font-medium text-indigo-400">{selected.size} selezionat{selected.size === 1 ? "o" : "i"}</span>
          <div className="ml-auto flex gap-1.5">
            <button onClick={() => handleBulkAction("done")} className="rounded-md bg-[#6ee7b7] px-3 py-1 text-[10px] font-semibold text-[#0b0d15] transition-all hover:brightness-110">Approva</button>
            <button onClick={() => handleBulkAction("in_progress")} className="rounded-md border border-[rgba(252,211,77,0.15)] bg-[rgba(252,211,77,0.08)] px-3 py-1 text-[10px] font-semibold text-[#fcd34d]">Revisione</button>
            <button onClick={() => handleBulkAction("cancelled")} className="rounded-md border border-[rgba(252,165,165,0.15)] bg-[rgba(252,165,165,0.08)] px-3 py-1 text-[10px] font-semibold text-[#fca5a5]">Rifiuta</button>
            <button onClick={() => setSelected(new Set())} className="ml-1 text-[10px] text-white/35 hover:text-white/60">Deseleziona</button>
          </div>
        </div>
      )}

      {/* Table header */}
      <div className="flex items-center border-b border-white/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/35 md:px-5">
        <input
          type="checkbox"
          checked={sorted.length > 0 && selected.size === sorted.length}
          onChange={toggleSelectAll}
          className="mr-2 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-white/20 bg-transparent accent-indigo-400"
        />
        <span className="hidden w-[60px] sm:block">ID</span>
        <span className="flex-1">Titolo</span>
        <span className="hidden w-[160px] md:block">Agente</span>
        <span className="w-[80px] sm:w-[100px]">Stato</span>
        <span className="hidden w-[80px] text-right sm:block">Aggiornato</span>
      </div>

      {/* Table rows */}
      <div className="flex-1 overflow-y-auto">
        {sorted.map((issue) => {
          const agent = issue.assigneeAgentId ? agentMap.get(issue.assigneeAgentId) : null;
          const status: CortexStatus = issueToV2Status(issue.status, {
            hasLiveRun: liveRunIssueIds.has(issue.id),
          });
          const s = cortexStatusStyles[status];

          return (
            <button
              key={issue.id}
              draggable
              onDragStart={() => { dragSrcId.current = issue.id; }}
              onDragOver={(e) => { e.preventDefault(); setDragOverId(issue.id); }}
              onDragLeave={() => { if (dragOverId === issue.id) setDragOverId(null); }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverId(null);
                const src = dragSrcId.current;
                if (!src || src === issue.id) return;
                const ids = sorted.map((i) => i.id);
                const srcIdx = ids.indexOf(src);
                const dstIdx = ids.indexOf(issue.id);
                if (srcIdx < 0 || dstIdx < 0) return;
                ids.splice(srcIdx, 1);
                ids.splice(dstIdx, 0, src);
                setDragOrder(ids);
              }}
              onDragEnd={() => { dragSrcId.current = null; setDragOverId(null); }}
              onClick={() => handleRowClick(issue.id)}
              onDoubleClick={() => navigate(`${issue.id}`)}
              className={cn(
                "flex w-full items-center border-b border-white/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03] md:px-5",
                selectedIssueId === issue.id && maskOpen && "bg-white/[0.04]",
                dragOverId === issue.id && "border-t-2 border-t-indigo-400",
              )}
            >
              <input
                type="checkbox"
                checked={selected.has(issue.id)}
                onChange={(e) => { e.stopPropagation(); toggleSelect(issue.id); }}
                onClick={(e) => e.stopPropagation()}
                className="mr-2 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-white/20 bg-transparent accent-indigo-400"
              />
              <span className="mr-1 hidden w-4 cursor-grab text-center text-[10px] text-white/20 active:cursor-grabbing sm:block">⋮⋮</span>
              <span className="hidden w-[60px] font-mono text-[11px] text-white/45 sm:block">
                {issue.identifier ?? "—"}
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2.5 pr-3">
                <span className="truncate text-[12px] md:text-[13px]">{issue.title}</span>
              </div>
              <div className="hidden w-[160px] items-center gap-2 md:flex">
                {agent ? (
                  <>
                    <AgentAvatar name={agent.name} status={status} size="sm" />
                    <span className="truncate text-[11px] text-white/60">{agent.name}</span>
                  </>
                ) : (
                  <span className="text-[11px] text-white/35">—</span>
                )}
              </div>
              <div className="relative w-[80px] sm:w-[100px]">
                <span
                  onClick={(e) => { e.stopPropagation(); setStatusDropdownId(statusDropdownId === issue.id ? null : issue.id); }}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-medium transition-all hover:brightness-125 sm:px-2.5 sm:text-[10px]",
                    s.bg, s.text,
                  )}
                >
                  <span className={cn("h-[5px] w-[5px] rounded-full", s.dot)} />
                  {STATUS_LABEL[issue.status] ?? issue.status}
                </span>
                {statusDropdownId === issue.id && (
                  <div className="absolute left-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-white/[0.08] bg-[#161a27] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.6)]" onClick={(e) => e.stopPropagation()}>
                    {(["todo", "in_progress", "blocked", "in_review", "done", "cancelled"] as const).map((st) => {
                      if (st === issue.status) return null;
                      const stStyle = cortexStatusStyles[issueToV2Status(st, {})];
                      return (
                        <button
                          key={st}
                          onClick={(e) => { e.stopPropagation(); handleQuickStatus(issue.id, st); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-white/70 transition-colors hover:bg-white/[0.06]"
                        >
                          <span className={cn("h-[5px] w-[5px] rounded-full", stStyle.dot)} />
                          {STATUS_LABEL[st]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <span className="hidden w-[80px] text-right font-mono text-[10px] text-white/35 sm:block">
                {relativeTime(issue.updatedAt)}
              </span>
            </button>
          );
        })}

        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 pt-32 text-white/35">
            <span className="text-[32px]">📋</span>
            <span className="text-[12px]">Nessuna issue</span>
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
