import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approvalsApi } from "../api/approvals";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { approvalLabel, typeIcon, defaultTypeIcon } from "./ApprovalPayload";
import { StatusBadge } from "./StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Check,
  X,
  MessageSquare,
  ChevronRight,
  RotateCcw,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import type { Approval } from "@paperclipai/shared";

/** Fetches the first linked issue ID for a redesign approval (approve_ceo_strategy). */
function useLinkedIssueId(approvalId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["approvals", "issues", approvalId],
    queryFn: () => approvalsApi.listIssues(approvalId),
    enabled,
    staleTime: 60_000,
    select: (issues) => issues[0]?.id ?? null,
  });
}

function ApprovalQuickCard({
  approval,
  agentName,
  onApprove,
  onReject,
  onRequestRevision,
  isPending,
}: {
  approval: Approval;
  agentName: string | null;
  onApprove: (note?: string) => void;
  onReject: (note: string) => void;
  onRequestRevision: (note: string) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const payload = approval.payload as Record<string, unknown>;
  const TypeIcon = typeIcon[approval.type] ?? defaultTypeIcon;
  const isActionable = approval.status === "pending" || approval.status === "revision_requested";
  const isRedesign = approval.type === "approve_ceo_strategy";
  const { data: linkedIssueId } = useLinkedIssueId(approval.id, isRedesign);

  return (
    <div className="border border-border rounded-xl bg-card p-3 space-y-2 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-2">
        <div className="shrink-0 mt-0.5 h-8 w-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <TypeIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight truncate">
            {approvalLabel(approval.type as string, payload)}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusBadge status={approval.status} />
            {agentName && (
              <span className="text-[11px] text-muted-foreground truncate">
                {t("approvalPanel.from")} {agentName}
              </span>
            )}
          </div>
        </div>
        <Link
          to={`/approvals/${approval.id}`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title="Dettagli"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Payload summary */}
      {approval.type === "hire_agent" && !!payload.name && (
        <div className="text-xs text-muted-foreground space-y-0.5 pl-10">
          {payload.role ? <p><span className="font-medium">Ruolo:</span> {String(payload.role)}</p> : null}
          {payload.adapterType ? <p><span className="font-medium">Adapter:</span> {String(payload.adapterType)}</p> : null}
          {Array.isArray(payload.desiredSkills) && (payload.desiredSkills as string[]).length > 0 ? (
            <p><span className="font-medium">Skill:</span> {(payload.desiredSkills as string[]).join(", ")}</p>
          ) : null}
          {payload.capabilities ? (
            <p className="line-clamp-2">{String(payload.capabilities)}</p>
          ) : null}
        </div>
      )}

      {approval.type === "approve_ceo_strategy" ? (
        <div className="pl-10 space-y-1">
          {(payload.description || payload.plan || payload.strategy) ? (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {String(payload.description ?? payload.plan ?? payload.strategy ?? "")}
            </p>
          ) : null}
          {(payload.style || payload.sections) ? (
            <div className="flex flex-wrap gap-2">
              {payload.style ? (
                <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  Stile: {String(payload.style)}
                </span>
              ) : null}
              {payload.sections ? (
                <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {String(payload.sections)} sezioni
                </span>
              ) : null}
            </div>
          ) : null}
          {linkedIssueId ? (
            <Link
              to={`/issues/${linkedIssueId}`}
              className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline font-medium"
            >
              <ExternalLink className="h-3 w-3" />
              Vedi issue con allegato HTML →
            </Link>
          ) : null}
        </div>
      ) : null}

      {approval.decisionNote ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 pl-10">
          Nota: {String(approval.decisionNote)}
        </p>
      ) : null}

      {/* Actions */}
      {isActionable && (
        <div className="pl-10 space-y-2">
          {expanded ? (
            <>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("approvalPanel.notePlaceholder")}
                className="text-xs min-h-[60px]"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="bg-green-700 hover:bg-green-600 text-white gap-1.5 h-7 text-xs"
                  onClick={() => { onApprove(note || undefined); setNote(""); setExpanded(false); }}
                  disabled={isPending}
                >
                  <Check className="h-3 w-3" /> {t("approvalPanel.approve")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-7 text-xs text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                  onClick={() => { if (note.trim()) { onRequestRevision(note); setNote(""); setExpanded(false); } }}
                  disabled={isPending || !note.trim()}
                  title={!note.trim() ? "Scrivi una nota per richiedere modifiche" : undefined}
                >
                  <RotateCcw className="h-3 w-3" /> {t("approvalPanel.revision")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5 h-7 text-xs"
                  onClick={() => { if (note.trim()) { onReject(note); setNote(""); setExpanded(false); } }}
                  disabled={isPending || !note.trim()}
                  title={!note.trim() ? "Scrivi una nota per motivare il rifiuto" : undefined}
                >
                  <X className="h-3 w-3" /> {t("approvalPanel.reject")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => { setExpanded(false); setNote(""); }}
                >
                  {t("approvalPanel.cancel")}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-green-700 hover:bg-green-600 text-white gap-1.5 h-7 text-xs"
                onClick={() => onApprove()}
                disabled={isPending}
              >
                <Check className="h-3 w-3" /> {t("approvalPanel.approve")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 h-7 text-xs text-muted-foreground"
                onClick={() => setExpanded(true)}
              >
                <MessageSquare className="h-3 w-3" /> {t("approvalPanel.reply")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ApprovalsSidePanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!, "pending"),
    queryFn: () => approvalsApi.list(selectedCompanyId!, "pending"),
    enabled: !!selectedCompanyId && open,
    refetchInterval: open ? 5000 : false,
  });

  const { data: allApprovals = [] } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!),
    queryFn: () => approvalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });

  const agentNameMap = new Map(agents.map((a) => [a.id, a.name]));

  const pendingApprovals = approvals.filter(
    (a) => a.status === "pending" || a.status === "revision_requested",
  );
  const recentResolved = allApprovals
    .filter((a) => a.status === "approved" || a.status === "rejected")
    .slice(0, 5);

  const invalidateAll = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId, "pending") });
    queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
  };

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => approvalsApi.approve(id, note),
    onSuccess: () => {
      pushToast({ title: "Approvazione confermata", tone: "success" });
      invalidateAll();
    },
    onError: (err) => pushToast({ title: err instanceof Error ? err.message : "Errore", tone: "error" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => approvalsApi.reject(id, note),
    onSuccess: (_, { id, note }) => {
      pushToast({ title: "Approvazione rifiutata", tone: "success" });
      // Create a revision task for the agent
      if (selectedCompanyId) {
        const approval = approvals.find((a) => a.id === id);
        if (approval?.requestedByAgentId) {
          issuesApi.create(selectedCompanyId, {
            title: `Revisione richiesta: ${approvalLabel(approval.type, approval.payload as Record<string, unknown>)}`,
            description: `## Rifiutata\n\n**Motivo:** ${note}\n\nL'approvazione originale e' stata rifiutata. Correggi e riproponi.\n\nID approvazione: \`${id}\``,
            assigneeAgentId: approval.requestedByAgentId,
            status: "todo",
          }).catch(() => { /* best effort */ });
        }
      }
      invalidateAll();
    },
    onError: (err) => pushToast({ title: err instanceof Error ? err.message : "Errore", tone: "error" }),
  });

  const revisionMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => approvalsApi.requestRevision(id, note),
    onSuccess: (_, { id, note }) => {
      pushToast({ title: "Revisione richiesta", tone: "success" });
      // Create revision task
      if (selectedCompanyId) {
        const approval = approvals.find((a) => a.id === id);
        if (approval?.requestedByAgentId) {
          issuesApi.create(selectedCompanyId, {
            title: `Modifiche richieste: ${approvalLabel(approval.type, approval.payload as Record<string, unknown>)}`,
            description: `## Modifiche richieste\n\n**Note:** ${note}\n\nApporta le modifiche indicate e riinvia l'approvazione.\n\nID approvazione: \`${id}\``,
            assigneeAgentId: approval.requestedByAgentId,
            status: "todo",
          }).catch(() => { /* best effort */ });
        }
      }
      invalidateAll();
    },
    onError: (err) => pushToast({ title: err instanceof Error ? err.message : "Errore", tone: "error" }),
  });

  const isMutating = approveMutation.isPending || rejectMutation.isPending || revisionMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[440px] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-600" />
            {t("approvalPanel.title")}
            {pendingApprovals.length > 0 && (
              <span className="ml-auto rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                {pendingApprovals.length} {t("approvalPanel.waiting")}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-3">
            {isLoading && (
              <p className="text-sm text-muted-foreground text-center py-8">{t("approvalPanel.loading")}</p>
            )}

            {!isLoading && pendingApprovals.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <ShieldCheck className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">{t("approvalPanel.empty")}</p>
                <p className="text-xs text-muted-foreground/70">
                  {t("approvalPanel.emptyDesc")}
                </p>
              </div>
            )}

            {pendingApprovals.map((approval) => (
              <ApprovalQuickCard
                key={approval.id}
                approval={approval}
                agentName={approval.requestedByAgentId ? agentNameMap.get(approval.requestedByAgentId) ?? null : null}
                onApprove={(note) => approveMutation.mutate({ id: approval.id, note })}
                onReject={(note) => rejectMutation.mutate({ id: approval.id, note })}
                onRequestRevision={(note) => revisionMutation.mutate({ id: approval.id, note })}
                isPending={isMutating}
              />
            ))}

            {recentResolved.length > 0 && (
              <>
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {t("approvalPanel.recent")}
                  </p>
                </div>
                {recentResolved.map((approval) => {
                  const TypeIcon = typeIcon[approval.type] ?? defaultTypeIcon;
                  return (
                    <Link
                      key={approval.id}
                      to={`/approvals/${approval.id}`}
                      className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm hover:bg-accent/30 transition-colors"
                    >
                      <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate text-xs">
                        {approvalLabel(approval.type, approval.payload as Record<string, unknown>)}
                      </span>
                      <StatusBadge status={approval.status} />
                    </Link>
                  );
                })}
              </>
            )}
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t border-border px-4 py-3">
          <Link
            to="/approvals"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => onOpenChange(false)}
          >
            {t("approvalPanel.viewAll")} →
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
