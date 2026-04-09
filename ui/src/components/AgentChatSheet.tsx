/**
 * AgentChatSheet — slide-in panel showing an agent's recent messages,
 * pending approvals, and a chat composer. Opens from anywhere (inbox,
 * dashboard, sidebar, future pixel office).
 *
 * Renders the agent "a mezzo busto" in the header with role/status,
 * then a scrollable feed of their recent issue comments + approvals.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { activityApi } from "../api/activity";
import { approvalsApi } from "../api/approvals";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";
import { Identity } from "./Identity";
import { StatusBadge } from "./StatusBadge";
import { AgentIcon } from "./AgentIconPicker";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Check,
  X,
  Clock,
  MessageSquare,
  ShieldCheck,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import type { Agent, ActivityEvent, Approval } from "@paperclipai/shared";

/* ── Types ─────────────────────────────────────────────────────────── */

interface AgentChatSheetProps {
  agent: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ── Helpers ────────────────────────────────────────────────────────── */

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: "In attesa",
  pending_approval: "In attesa",
  revision_requested: "Revisione richiesta",
  approved: "Approvato",
  rejected: "Rifiutato",
};

const APPROVAL_STATUS_COLORS: Record<string, string> = {
  pending: "border-amber-500/40 bg-amber-500/[0.06]",
  pending_approval: "border-amber-500/40 bg-amber-500/[0.06]",
  revision_requested: "border-orange-500/40 bg-orange-500/[0.06]",
  approved: "border-green-500/30 bg-green-500/[0.06]",
  rejected: "border-red-500/30 bg-red-500/[0.06]",
};

/* ── Component ──────────────────────────────────────────────────────── */

export function AgentChatSheet({ agent, open, onOpenChange }: AgentChatSheetProps) {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  /* ── Data ── */
  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!, { agentId: agent?.id }),
    enabled: open && !!selectedCompanyId && !!agent,
  });

  const { data: allApprovals } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!),
    queryFn: () => approvalsApi.list(selectedCompanyId!),
    enabled: open && !!selectedCompanyId && !!agent,
  });

  /* Agent's recent comments (last 20) */
  const recentComments = useMemo(() => {
    if (!activity || !agent) return [];
    return activity
      .filter(
        (ev: ActivityEvent) =>
          (ev.actorId === agent.id || ev.agentId === agent.id) &&
          (ev.action === "issue.comment_added" || ev.action === "issue.commented"),
      )
      .slice(0, 20);
  }, [activity, agent]);

  /* Agent's pending approvals */
  const pendingApprovals = useMemo(() => {
    if (!allApprovals || !agent) return [];
    return allApprovals.filter(
      (a: Approval) =>
        a.requestedByAgentId === agent.id &&
        (a.status === "pending" || a.status === "revision_requested"),
    );
  }, [allApprovals, agent]);

  const { pushToast } = useToast();

  /* ── Mutations ── */
  const approveMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
      pushToast({ title: "Approvato", tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: "Errore approvazione", body: err.message, tone: "error" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
      pushToast({ title: "Rifiutato", tone: "info" });
    },
    onError: (err: Error) => {
      pushToast({ title: "Errore rifiuto", body: err.message, tone: "error" });
    },
  });

  if (!agent) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[460px] p-0 flex flex-col">
        {/* ── Header: agent "a mezzo busto" ── */}
        <SheetHeader className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <AgentIcon icon={agent.icon} className="h-6 w-6 text-foreground/70" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base font-semibold truncate">
                {agent.name}
              </SheetTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">{agent.role}</span>
                <StatusBadge status={agent.status} />
              </div>
            </div>
            <Link
              to={`/agents/${agent.id}`}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Apri profilo agente"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            {agent.lastHeartbeatAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Ultimo run: {timeAgo(agent.lastHeartbeatAt)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {recentComments.length} messaggi recenti
            </span>
            {pendingApprovals.length > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-400">
                <ShieldCheck className="h-3 w-3" />
                {pendingApprovals.length} in attesa
              </span>
            )}
          </div>
        </SheetHeader>

        {/* ── Scrollable feed ── */}
        <div className="flex-1 overflow-y-auto">
          {/* Pending approvals section */}
          {pendingApprovals.length > 0 && (
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-3">
                🔴 Approvazioni in attesa ({pendingApprovals.length})
              </h3>
              <div className="space-y-2">
                {pendingApprovals.map((approval) => (
                  <ApprovalBubble
                    key={approval.id}
                    approval={approval}
                    onApprove={() => approveMutation.mutate(approval.id)}
                    onReject={() => rejectMutation.mutate(approval.id)}
                    isPending={approveMutation.isPending || rejectMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent messages */}
          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Messaggi recenti
            </h3>
            {recentComments.length === 0 ? (
              <p className="text-sm text-muted-foreground/60 text-center py-6">
                Nessun messaggio recente da {agent.name}.
              </p>
            ) : (
              <div className="space-y-3">
                {recentComments.map((ev: ActivityEvent) => (
                  <MessageBubble key={ev.id} event={ev} agent={agent} />
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function ApprovalBubble({
  approval,
  onApprove,
  onReject,
  isPending,
}: {
  approval: Approval;
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
}) {
  const statusLabel = APPROVAL_STATUS_LABELS[approval.status] ?? approval.status;
  const colors = APPROVAL_STATUS_COLORS[approval.status] ?? "border-border bg-card";
  const payload = approval.payload as Record<string, unknown> | null;
  const stepTitle = payload?.stepTitle as string | undefined;

  return (
    <div className={cn("rounded-lg border p-3", colors)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-foreground">
            {stepTitle || approval.type.replaceAll("_", " ")}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {statusLabel} · {timeAgo(approval.createdAt)}
          </div>
        </div>
      </div>
      {(approval.status === "pending" || approval.status === "revision_requested") && (
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700"
            onClick={onApprove}
            disabled={isPending}
          >
            <Check className="h-3 w-3 mr-1" /> Approva
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs"
            onClick={onReject}
            disabled={isPending}
          >
            <X className="h-3 w-3 mr-1" /> Rifiuta
          </Button>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ event, agent }: { event: ActivityEvent; agent: Agent }) {
  const details = event.details as Record<string, unknown> | null;
  const snippet = details?.bodySnippet as string | undefined;
  const identifier = details?.identifier as string | undefined;
  const issueTitle = details?.issueTitle as string | undefined;

  return (
    <div className="flex gap-2.5 items-start">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 text-foreground/60" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-lg rounded-tl-sm border border-border bg-card/60 px-3 py-2">
          {/* Issue reference */}
          {(identifier || issueTitle) && (
            <Link
              to={`/issues/${identifier ?? event.entityId}`}
              className="flex items-center gap-1.5 text-[11px] text-primary hover:underline mb-1 no-underline"
            >
              {identifier && <span className="font-mono text-[10px] text-muted-foreground">{identifier}</span>}
              {issueTitle && <span className="truncate">{issueTitle}</span>}
            </Link>
          )}
          {/* Message content */}
          {snippet ? (
            <p className="text-sm text-foreground/90 leading-relaxed line-clamp-4">{snippet}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Commento senza anteprima</p>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1 px-1">
          {timeAgo(event.createdAt)}
        </div>
      </div>
    </div>
  );
}
