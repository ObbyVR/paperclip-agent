/**
 * AgentChatSheet — slide-in panel showing an agent's recent messages,
 * pending approvals, and a chat composer. Opens from anywhere (inbox,
 * dashboard, sidebar, future pixel office).
 *
 * Renders the agent "a mezzo busto" in the header with role/status,
 * then a scrollable feed of their recent issue comments + approvals.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
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
          <div className="flex items-center gap-4">
            <AgentPortrait agent={agent} />
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

/* ── Portrait (procedural bust) ─────────────────────────────────────── */

const SKIN_TONES = ["#f0c8a0", "#e0b090", "#d09868", "#b07848", "#905830"];
const HAIR_COLORS = ["#1a1a2e", "#3d2b1f", "#8b4513", "#c5a880", "#b83a14", "#daa520", "#2d1b0e", "#4a2c2a"];
const SHIRT_COLORS = [
  "#4a6fa5", "#6b5b95", "#88b04b", "#ff6f61", "#45b8ac",
  "#d4507a", "#5a7d9a", "#b5838d", "#e6a157", "#7c6f9a",
  "#3a8a6e", "#c06040",
];

const STATUS_GLOW: Record<string, string> = {
  active: "#22c55e", running: "#06b6d4", idle: "#6b7280",
  paused: "#f59e0b", error: "#ef4444",
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function AgentPortrait({ agent }: { agent: Agent }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const draw = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const S = 96;
    ctx.clearRect(0, 0, S, S);

    const h = hashStr(agent.id);
    const skin = SKIN_TONES[h % SKIN_TONES.length];
    const hair = HAIR_COLORS[(h >> 4) % HAIR_COLORS.length];
    const shirt = SHIRT_COLORS[(h >> 8) % SHIRT_COLORS.length];
    const isWorking = agent.status === "active" || agent.status === "running";
    const isPaused = agent.status === "paused";
    const isError = agent.status === "error";
    const glow = STATUS_GLOW[agent.status] ?? STATUS_GLOW.idle;

    const t = time / 1000;
    const breathY = Math.sin(t * 2 + h) * 1.5;
    const cx = S / 2;

    // Background glow
    const grad = ctx.createRadialGradient(cx, S / 2, 5, cx, S / 2, 45);
    grad.addColorStop(0, glow + "18");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    // ── Shoulders / shirt ──
    const shY = 62 + breathY;
    ctx.fillStyle = shirt;
    rr(ctx, cx - 28, shY, 56, 38, 8); ctx.fill();
    // Collar
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.moveTo(cx - 8, shY); ctx.lineTo(cx, shY + 10); ctx.lineTo(cx + 8, shY); ctx.closePath(); ctx.fill();
    // Shirt highlight
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(cx - 24, shY + 2, 16, 30);
    // Shirt button
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath(); ctx.arc(cx, shY + 16, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, shY + 24, 1.5, 0, Math.PI * 2); ctx.fill();

    // ── Neck ──
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 6, shY - 6, 12, 10);

    // ── Head ──
    const headY = 18 + breathY;
    ctx.fillStyle = skin;
    rr(ctx, cx - 16, headY, 32, 30, 10); ctx.fill();
    // Ear
    ctx.beginPath(); ctx.ellipse(cx - 16, headY + 16, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 16, headY + 16, 4, 6, 0, 0, Math.PI * 2); ctx.fill();

    // ── Hair ──
    const hairStyle = h % 4;
    ctx.fillStyle = hair;
    if (hairStyle === 0) { rr(ctx, cx - 17, headY - 6, 34, 16, 8); ctx.fill(); ctx.fillRect(cx - 18, headY + 2, 5, 14); ctx.fillRect(cx + 13, headY + 2, 5, 14); }
    else if (hairStyle === 1) { rr(ctx, cx - 18, headY - 8, 36, 18, 10); ctx.fill(); ctx.fillRect(cx - 19, headY, 6, 16); ctx.fillRect(cx + 13, headY, 6, 16); }
    else if (hairStyle === 2) { rr(ctx, cx - 19, headY - 8, 38, 16, 10); ctx.fill(); rr(ctx, cx - 20, headY + 2, 7, 22, 3); ctx.fill(); rr(ctx, cx + 13, headY + 2, 7, 22, 3); ctx.fill(); }
    else { rr(ctx, cx - 17, headY - 10, 34, 18, 6); ctx.fill(); ctx.fillRect(cx - 12, headY - 14, 4, 7); ctx.fillRect(cx - 3, headY - 16, 4, 7); ctx.fillRect(cx + 6, headY - 14, 4, 7); }

    // ── Eyes ──
    const eyeY = headY + 14;
    if (isPaused) {
      // Sleepy eyes (closed lines)
      ctx.strokeStyle = "#1a1a2e"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 10, eyeY + 2); ctx.lineTo(cx - 4, eyeY + 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 4, eyeY + 2); ctx.lineTo(cx + 10, eyeY + 2); ctx.stroke();
    } else {
      // Open eyes
      ctx.fillStyle = "#fff";
      rr(ctx, cx - 11, eyeY, 8, 6, 3); ctx.fill();
      rr(ctx, cx + 3, eyeY, 8, 6, 3); ctx.fill();
      // Pupils (look at viewer)
      ctx.fillStyle = "#1a1a2e";
      const px = isWorking ? 1 : 0;
      ctx.fillRect(cx - 8 + px, eyeY + 2, 3, 3);
      ctx.fillRect(cx + 5 + px, eyeY + 2, 3, 3);
      // Catchlight
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillRect(cx - 7, eyeY + 1, 1, 1);
      ctx.fillRect(cx + 6, eyeY + 1, 1, 1);
    }

    // Eyebrows
    ctx.fillStyle = hair;
    ctx.fillRect(cx - 11, eyeY - 3, 7, 2);
    ctx.fillRect(cx + 4, eyeY - 3, 7, 2);
    if (isError) {
      ctx.fillRect(cx - 12, eyeY - 5, 4, 2);
      ctx.fillRect(cx + 8, eyeY - 5, 4, 2);
    }

    // Mouth
    if (isWorking) {
      ctx.fillStyle = "#c07060";
      rr(ctx, cx - 3, headY + 22, 6, 3, 2); ctx.fill();
    } else if (isError) {
      ctx.strokeStyle = "#a06050"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, headY + 26, 4, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
    } else if (isPaused) {
      ctx.fillStyle = "#a06050";
      ctx.fillRect(cx - 3, headY + 23, 6, 2);
    } else {
      ctx.strokeStyle = "#a06050"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, headY + 21, 4, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
    }

    // Status ring around portrait
    ctx.strokeStyle = glow;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, S / 2, 44, 0, Math.PI * 2); ctx.stroke();
  }, [agent]);

  useEffect(() => {
    let running = true;
    const loop = (ts: number) => {
      if (!running) return;
      draw(ts);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={96}
      height={96}
      style={{ imageRendering: "pixelated", width: 80, height: 80 }}
      className="shrink-0 rounded-xl"
    />
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
