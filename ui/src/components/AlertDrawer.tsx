import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import {
  Check,
  Eye,
  PauseCircle,
  Ban,
  X,
  Send,
  Clock,
  Paperclip,
  Archive,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type { Agent, Issue, IssueComment } from "@paperclipai/shared";
import type { InboxWorkItem, InboxItemContext } from "../lib/inbox";
import { ACTIONABLE_APPROVAL_STATUSES } from "../lib/inbox";
import { approvalLabel, defaultTypeIcon, typeIcon } from "./ApprovalPayload";
import { MarkdownBody } from "./MarkdownBody";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";

/**
 * AlertDrawer — a right-side slide-out panel shown when the user clicks an
 * alert row in the inbox projects view. This is the S41 minimal version:
 *
 *   HEADER (sticky)
 *     - Type label (colored) + title + close button
 *     - Row of 4 actions: Approva / Revisiona / Sospendi / Blocca
 *     - When an action is clicked, an inline note bar slides in below the
 *       header with a text field + Conferma button.
 *
 *   BODY (scrollable)
 *     - For issues: the issue description + status + assignee agent
 *     - For approvals: the approval type + payload summary
 *     - For failed runs: the run error + stderr excerpt
 *     - For join requests: the request details
 *
 *   FOOTER (sticky)
 *     - "Scrivi un messaggio all'agente" composer, same pattern as the card.
 *
 * Not yet included (intentionally — future iteration):
 *   - Chat / comment thread
 *   - Output file attachments with inline preview
 *   - Color-coded result tables
 * These will land once the underlying data is wired; for now the drawer
 * replaces the "navigate away to a full page" behavior with a contextual
 * overlay that keeps the inbox in view.
 */

type DrawerAction = "approve" | "review" | "suspend" | "block";

interface AlertDrawerProps {
  item: InboxWorkItem;
  context: InboxItemContext;
  issueById: Map<string, Issue>;
  agentById?: Map<string, Agent>;
  onClose: () => void;
  onApprove?: (note: string) => void;
  onReview?: (note: string) => void;
  onSuspend?: (note: string) => void;
  onBlock?: (note: string) => void;
  onArchive?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** Display string like "3 / 17" shown next to the prev/next controls. */
  positionLabel?: string;
  isPending?: boolean;
}

const CATEGORY_COLOR_TEXT: Record<string, string> = {
  richiesta: "text-amber-600 dark:text-amber-400",
  messaggio: "text-sky-600 dark:text-sky-400",
  aggiornamento: "text-violet-600 dark:text-violet-400",
};

const CATEGORY_LABEL: Record<string, string> = {
  richiesta: "RICHIESTA",
  messaggio: "MESSAGGIO",
  aggiornamento: "AGGIORNAMENTO",
};

function resolveTitle(item: InboxWorkItem, issueById: Map<string, Issue>): string {
  if (item.kind === "issue") return item.issue.title;
  if (item.kind === "approval")
    return approvalLabel(
      item.approval.type,
      item.approval.payload as Record<string, unknown> | null,
    );
  if (item.kind === "failed_run") {
    const ctx = item.run.contextSnapshot as Record<string, unknown> | null;
    const iid = ctx ? (ctx["issueId"] ?? ctx["taskId"]) : null;
    const issue = typeof iid === "string" ? issueById.get(iid) ?? null : null;
    if (issue) return issue.title;
    return (item.run.error ?? "Run failed").split("\n")[0] ?? "Run failed";
  }
  const jr = item.joinRequest;
  return jr.requestType === "human"
    ? "Richiesta di accesso utente"
    : `Richiesta join agente${jr.agentName ? `: ${jr.agentName}` : ""}`;
}

/** Human-friendly relative time for a comment. */
function formatCommentTime(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const diffMs = Date.now() - d.getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}g`;
  return d.toLocaleDateString();
}

function CommentHistoryPanel({
  issueId,
  agentById,
}: {
  issueId: string;
  agentById?: Map<string, Agent>;
}) {
  const {
    data: comments = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.issues.comments(issueId),
    queryFn: () => issuesApi.listComments(issueId),
  });

  if (isLoading) {
    return (
      <div className="border-t border-border bg-muted/10 px-5 py-3 text-center text-[11px] text-muted-foreground">
        Caricamento commenti...
      </div>
    );
  }
  if (isError) {
    return (
      <div className="border-t border-border bg-destructive/5 px-5 py-3 text-center text-[11px] text-destructive">
        <div>
          Errore caricamento commenti
          {error instanceof Error && error.message ? `: ${error.message}` : ""}
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-1 rounded-md border border-destructive/30 px-2 py-0.5 text-[11px] hover:bg-destructive/10"
        >
          Riprova
        </button>
      </div>
    );
  }
  if (comments.length === 0) {
    return (
      <div className="border-t border-border bg-muted/10 px-5 py-3 text-center text-[11px] italic text-muted-foreground">
        Nessun commento. Scrivi il primo qui sotto.
      </div>
    );
  }

  // Show at most the last 20, newest at the bottom (chat convention).
  const recent = (comments as IssueComment[]).slice(-20);

  return (
    <div className="max-h-[280px] overflow-y-auto border-t border-border bg-muted/10 px-5 py-3">
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        Commenti ({comments.length})
      </div>
      <div className="space-y-2.5">
        {recent.map((c) => {
          const agent = c.authorAgentId && agentById ? agentById.get(c.authorAgentId) : null;
          const authorLabel = agent
            ? agent.name
            : c.authorUserId
            ? "Tu"
            : "Sistema";
          const isUser = !!c.authorUserId;
          return (
            <div
              key={c.id}
              className={cn(
                "rounded-md border border-border px-2.5 py-1.5 text-[12px]",
                isUser ? "bg-primary/5" : "bg-background",
              )}
            >
              <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {agent?.icon && <span>{agent.icon}</span>}
                <span className="font-medium text-foreground/80">{authorLabel}</span>
                <span className="opacity-60">·</span>
                <span>{formatCommentTime(c.createdAt)}</span>
              </div>
              <div className="whitespace-pre-wrap break-words text-foreground/90">{c.body}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * MarkdownWithHexChips — wraps MarkdownBody and, after it renders, scans text
 * nodes inside the rendered tree for hex color tokens (#rgb or #rrggbb) and
 * substitutes them with a colored chip: a tiny square swatch followed by the
 * code in a monospace span. The swap happens via a MutationObserver-like
 * DOM walk in useEffect so we don't touch the shared MarkdownBody component
 * or re-parse the markdown AST. The swatch uses the literal hex as its
 * background so the rendered preview is always correct.
 *
 * The founder explicitly asked for this in the original brief: "I dati, le
 * tabelle, i colori, ecc all'interno devono essere presentati secondo uno
 * schema ordinato, ... colori hex con codice e render del codice visuale".
 */
const HEX_TOKEN_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
// Non-global twin used in the walker's acceptNode so the /g lastIndex state of
// HEX_TOKEN_RE cannot leak across text nodes and accidentally skip matches in
// later nodes (which used to hide hex chips inside fenced code blocks that
// happen to appear after a match in free text).
const HEX_TOKEN_TEST_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/;

function decorateHexTokens(root: HTMLElement) {
  // Walk all text nodes. We DO decorate inside <code>/<pre> blocks on purpose
  // — the founder asked for visual color chips next to hex codes wherever they
  // appear, including code fences. We only skip SCRIPT/STYLE and nodes already
  // inside an existing chip (so re-runs are idempotent).
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      let el: Node | null = node.parentNode;
      while (el && el !== root) {
        if (el instanceof HTMLElement) {
          if (el.classList.contains("hex-color-chip")) return NodeFilter.FILTER_REJECT;
          if (el.tagName === "SCRIPT" || el.tagName === "STYLE")
            return NodeFilter.FILTER_REJECT;
        }
        el = el.parentNode;
      }
      return HEX_TOKEN_TEST_RE.test(node.nodeValue ?? "")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const targets: Text[] = [];
  let current = walker.nextNode() as Text | null;
  while (current) {
    targets.push(current);
    current = walker.nextNode() as Text | null;
  }

  for (const textNode of targets) {
    const text = textNode.nodeValue ?? "";
    HEX_TOKEN_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = HEX_TOKEN_RE.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      if (before) frag.appendChild(document.createTextNode(before));

      const chip = document.createElement("span");
      chip.className = "hex-color-chip inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-1 py-[1px] font-mono text-[11px]";

      const swatch = document.createElement("span");
      swatch.className = "inline-block h-2.5 w-2.5 rounded-sm border border-black/20";
      swatch.style.backgroundColor = match[0];
      chip.appendChild(swatch);

      const code = document.createElement("span");
      code.textContent = match[0];
      chip.appendChild(code);

      frag.appendChild(chip);
      lastIndex = match.index + match[0].length;
    }
    const after = text.slice(lastIndex);
    if (after) frag.appendChild(document.createTextNode(after));

    textNode.parentNode?.replaceChild(frag, textNode);
  }
}

function MarkdownWithHexChips({ children }: { children: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    // Run once after the markdown has rendered.
    decorateHexTokens(ref.current);
  }, [children]);
  return (
    <div ref={ref}>
      <MarkdownBody className="text-foreground/90">{children}</MarkdownBody>
    </div>
  );
}

function IssueAttachmentChips({ issueId }: { issueId: string }) {
  const { data: attachments = [], isError } = useQuery({
    queryKey: queryKeys.issues.attachments(issueId),
    queryFn: () => issuesApi.listAttachments(issueId),
  });
  if (isError) {
    return (
      <div className="text-[11px] text-destructive">
        Impossibile caricare gli allegati.
      </div>
    );
  }
  if (attachments.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Output ({attachments.length})
      </div>
      <div className="flex flex-wrap gap-1.5">
        {attachments.map((att) => {
          const label = att.originalFilename ?? att.objectKey.split("/").pop() ?? att.id.slice(0, 8);
          return (
            <a
              key={att.id}
              href={att.contentPath}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-[240px] items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] text-foreground/80 no-underline transition-colors hover:bg-accent"
              title={label}
            >
              <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{label}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function DrawerBody({
  item,
  issueById,
}: {
  item: InboxWorkItem;
  issueById: Map<string, Issue>;
}) {
  if (item.kind === "issue") {
    const { issue } = item;
    return (
      <div className="space-y-4 text-sm">
        <IssueAttachmentChips issueId={issue.id} />
        {issue.description ? (
          <MarkdownWithHexChips>{issue.description}</MarkdownWithHexChips>
        ) : (
          <div className="italic text-muted-foreground">Nessuna descrizione.</div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            Stato: <span className="font-medium text-foreground/80">{issue.status}</span>
          </span>
          {issue.priority && (
            <span>
              Priorita': <span className="font-medium text-foreground/80">{issue.priority}</span>
            </span>
          )}
          {issue.identifier && (
            <span>
              ID: <span className="font-mono text-foreground/80">{issue.identifier}</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  if (item.kind === "approval") {
    const Icon = typeIcon[item.approval.type] ?? defaultTypeIcon;
    const payload = item.approval.payload as Record<string, unknown> | null;
    return (
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-xs uppercase tracking-wide">{item.approval.type}</span>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/80">
            {payload ? JSON.stringify(payload, null, 2) : "(nessun payload)"}
          </pre>
        </div>
        <div className="text-xs text-muted-foreground">
          Stato:{" "}
          <span className="font-medium text-foreground/80">{item.approval.status}</span>
        </div>
      </div>
    );
  }

  if (item.kind === "failed_run") {
    const ctx = item.run.contextSnapshot as Record<string, unknown> | null;
    const iid = ctx ? (ctx["issueId"] ?? ctx["taskId"]) : null;
    const issue = typeof iid === "string" ? issueById.get(iid) ?? null : null;
    return (
      <div className="space-y-3 text-sm">
        {issue && (
          <div className="text-xs text-muted-foreground">
            Task:{" "}
            <span className="font-medium text-foreground/80">
              {issue.identifier ?? issue.id.slice(0, 8)} — {issue.title}
            </span>
          </div>
        )}
        {item.run.error && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Errore</div>
            <pre className="whitespace-pre-wrap break-words rounded-md border border-red-500/30 bg-red-500/5 p-3 font-mono text-[11px] text-red-700 dark:text-red-300">
              {item.run.error}
            </pre>
          </div>
        )}
        {item.run.stderrExcerpt && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Stderr</div>
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] text-foreground/80">
              {item.run.stderrExcerpt}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // join_request
  const jr = item.joinRequest;
  return (
    <div className="space-y-2 text-sm">
      <div>
        Tipo:{" "}
        <span className="font-medium text-foreground/80">
          {jr.requestType === "human" ? "Utente" : "Agente"}
        </span>
      </div>
      {jr.agentName && (
        <div>
          Nome: <span className="font-medium text-foreground/80">{jr.agentName}</span>
        </div>
      )}
      {jr.adapterType && (
        <div>
          Adapter: <span className="font-mono text-foreground/80">{jr.adapterType}</span>
        </div>
      )}
    </div>
  );
}

export function AlertDrawer({
  item,
  context,
  issueById,
  agentById,
  onClose,
  onApprove,
  onReview,
  onSuspend,
  onBlock,
  onArchive,
  onPrev,
  onNext,
  positionLabel,
  isPending = false,
}: AlertDrawerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const [pendingAction, setPendingAction] = useState<DrawerAction | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  // S42 — "Richiama l'agente" toggle (default on). When enabled, the comment
  // asks the backend to wake up the assignee regardless of issue status:
  //   - closed (done/cancelled) → `reopen: true` re-activates it and triggers
  //     wake-up via `issue_reopened_via_comment`.
  //   - in_progress with a running run → `interrupt: true` cancels the current
  //     run and re-queues the wake, guaranteeing the agent picks up the comment.
  //   - other statuses → the backend already wakes the assignee automatically;
  //     the flag is a no-op but kept consistent so the user sees predictable
  //     behaviour.
  const [wakeAgentOnSend, setWakeAgentOnSend] = useState(true);
  const [suspendUntil, setSuspendUntil] = useState<string | null>(null);
  const [suspendCustomDate, setSuspendCustomDate] = useState<string>("");
  const panelRef = useRef<HTMLElement | null>(null);

  const title = useMemo(() => resolveTitle(item, issueById), [item, issueById]);
  const categoryText = CATEGORY_COLOR_TEXT[context.category] ?? CATEGORY_COLOR_TEXT.aggiornamento;
  const categoryLabel = CATEGORY_LABEL[context.category] ?? "";

  // Resolve the issue id that chat/attachments should target. For an issue
  // item it's trivial; for a failed_run we take the linked issue from the
  // context snapshot so the user can still talk to the agent about the
  // failing task. For approvals / join requests there is no natural target
  // yet, so we disable the composer.
  const chatTargetIssueId = useMemo<string | null>(() => {
    if (item.kind === "issue") return item.issue.id;
    if (item.kind === "failed_run") {
      const ctx = item.run.contextSnapshot as Record<string, unknown> | null;
      const iid = ctx ? (ctx["issueId"] ?? ctx["taskId"]) : null;
      if (typeof iid === "string") return iid;
    }
    return null;
  }, [item]);

  // Derive the current status of the target issue so we can decide whether
  // a comment needs `reopen` / `interrupt` to actually wake the agent. The
  // server auto-wakes the assignee for open statuses, but closed issues
  // require an explicit `reopen: true` — otherwise the comment lands in the
  // database and the agent never hears about it.
  const chatTargetIssue = chatTargetIssueId ? issueById.get(chatTargetIssueId) ?? null : null;
  const chatTargetStatus = chatTargetIssue?.status ?? null;
  const chatTargetIsClosed = chatTargetStatus === "done" || chatTargetStatus === "cancelled";
  const chatTargetIsRunning = chatTargetStatus === "in_progress";

  const addCommentMutation = useMutation({
    mutationFn: async ({ body, wake }: { body: string; wake: boolean }) => {
      if (!chatTargetIssueId) throw new Error("No issue target for chat");
      // Closed issue + wake requested → reopen the issue (server triggers
      // the wake via `issue_reopened_via_comment`).
      const reopen = wake && chatTargetIsClosed ? true : undefined;
      // Running issue + wake requested → interrupt the active run so the
      // re-queue picks up the new comment. Board users only; the server
      // returns 403 otherwise, which bubbles up through onError.
      const interrupt = wake && chatTargetIsRunning ? true : undefined;
      return issuesApi.addComment(chatTargetIssueId, body, reopen, interrupt);
    },
    onSuccess: () => {
      // Invalidate every query that shows this comment or the related
      // activity/feeds. Live-updates via WebSocket should cover most of
      // these on their own, but an explicit invalidation guarantees the
      // UI converges even when the socket is stale or disconnected.
      if (chatTargetIssueId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.issues.comments(chatTargetIssueId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.issues.detail(chatTargetIssueId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.issues.activity(chatTargetIssueId),
        });
      }
      if (selectedCompanyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.activity(selectedCompanyId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.issues.list(selectedCompanyId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.dashboard(selectedCompanyId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.sidebarBadges(selectedCompanyId),
        });
      }
      setChatDraft("");
    },
    onError: (err) => {
      // Surface the failure to devtools — the UI already shows a small
      // "Errore invio — riprova" chip via `isError`, but the console log
      // helps pinpoint 403/500/network issues.
      // eslint-disable-next-line no-console
      console.error("[AlertDrawer] addComment failed", err);
    },
  });

  // Focus trap: on mount, remember where focus came from, move focus into the
  // panel so keyboard users land inside the dialog, and intercept Tab /
  // Shift+Tab so focus cycles within the panel instead of escaping to the
  // inbox behind. On unmount, restore focus to the originally focused element
  // (typically the AlertRow that triggered the drawer) so the inbox keeps
  // its place.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (!panel) return;

    const FOCUSABLE_SELECTOR =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusable = (): HTMLElement[] => {
      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("aria-hidden") && el.offsetParent !== null,
      );
    };

    // Delay one frame so the slide-in animation doesn't fight with scroll-to-focus.
    const rafId = window.requestAnimationFrame(() => {
      const focusables = getFocusable();
      if (focusables.length > 0) {
        focusables[0].focus({ preventScroll: true });
      } else {
        panel.focus({ preventScroll: true });
      }
    });

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = getFocusable();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // If focus somehow escaped the panel, pull it back.
      if (!active || !panel.contains(active)) {
        e.preventDefault();
        first.focus({ preventScroll: true });
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    panel.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      panel.removeEventListener("keydown", onKeyDown);
      // Only restore focus if the element that opened the drawer is still in
      // the DOM and focusable; otherwise leave it to the browser default.
      if (
        previouslyFocused &&
        typeof previouslyFocused.focus === "function" &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
    // Intentionally run once per drawer mount (not per item change) — the
    // keyboard nav between items keeps the same panel and same focusables
    // list, we don't need to re-run the trap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on Escape, navigate with ↑ / ↓ / j / k.
  // The shortcuts are ignored when the user is typing inside an input so
  // they never clobber chat composition or action notes.
  useEffect(() => {
    const isTextTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (isTextTarget(e.target)) return;
      if ((e.key === "ArrowDown" || e.key === "j") && onNext) {
        e.preventDefault();
        onNext();
      } else if ((e.key === "ArrowUp" || e.key === "k") && onPrev) {
        e.preventDefault();
        onPrev();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, onNext, onPrev]);

  const canApprove =
    item.kind === "approval" &&
    item.approval.type !== "budget_override_required" &&
    ACTIONABLE_APPROVAL_STATUSES.has(item.approval.status) &&
    !!onApprove;

  const openActionBar = (action: DrawerAction) => {
    setPendingAction(action);
    setActionNote("");
  };

  const confirmAction = () => {
    if (!pendingAction) return;
    const note = actionNote.trim();
    if (pendingAction === "approve") onApprove?.(note);
    if (pendingAction === "review") onReview?.(note);
    if (pendingAction === "suspend") {
      // Combine the chosen "until when" preset with the optional reason so the
      // backend (when it lands) has a single structured note. For "custom"
      // preset we substitute the ISO datetime chosen by the user.
      const untilValue =
        suspendUntil === "custom" ? (suspendCustomDate || null) : suspendUntil;
      const payload = untilValue
        ? `[until=${untilValue}] ${note}`.trim()
        : note;
      onSuspend?.(payload);
    }
    if (pendingAction === "block") onBlock?.(note);
    setPendingAction(null);
    setActionNote("");
    setSuspendCustomDate("");
  };

  const cancelAction = () => {
    setPendingAction(null);
    setActionNote("");
  };

  const sendChat = () => {
    const body = chatDraft.trim();
    if (!body || !chatTargetIssueId) return;
    addCommentMutation.mutate({ body, wake: wakeAgentOnSend });
  };

  const handleChatKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendChat();
    }
  };

  // Suspend quick-pick presets — UI only. Backend wiring lands with the real
  // suspended_until column migration. For now the selected value is recorded
  // locally and passed to the onSuspend callback as the action note so the
  // caller can decide what to do with it (today: nothing; tomorrow: call a
  // POST /issues/:id/suspend endpoint).
  const suspendPresets = [
    { label: "1 ora", value: "1h" },
    { label: "4 ore", value: "4h" },
    { label: "Domani 9:00", value: "tomorrow-9" },
    { label: "Scegli data", value: "custom" },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "flex h-full w-full max-w-[640px] flex-col border-l border-border bg-background shadow-2xl outline-none",
          "animate-in slide-in-from-right duration-200",
        )}
      >
        {/* Sticky header */}
        <header className="shrink-0 border-b border-border bg-background">
          <div className="flex items-start gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className={cn("text-[10px] font-semibold uppercase tracking-wider", categoryText)}>
                {categoryLabel}
                {context.agentName && (
                  <span className="ml-1.5 font-normal normal-case text-muted-foreground">
                    · {context.agentIcon ? `${context.agentIcon} ` : ""}
                    {context.agentName}
                  </span>
                )}
              </div>
              <h2 className="mt-1 truncate text-base font-semibold text-foreground">{title}</h2>
              {context.projectName && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">{context.projectName}</div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {onPrev && (
                <button
                  type="button"
                  onClick={onPrev}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Alert precedente"
                  title="Precedente (↑ / k)"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
              )}
              {positionLabel && (
                <span className="px-1 text-[10px] tabular-nums text-muted-foreground">
                  {positionLabel}
                </span>
              )}
              {onNext && (
                <button
                  type="button"
                  onClick={onNext}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Alert successivo"
                  title="Successivo (↓ / j)"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              )}
              {onArchive && (
                <button
                  type="button"
                  onClick={() => {
                    onArchive();
                    onClose();
                  }}
                  className="ml-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Archivia"
                  title="Archivia questo alert"
                >
                  <Archive className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Chiudi"
                title="Chiudi (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Action buttons row */}
          <div className="flex items-center gap-2 px-5 pb-3">
            {canApprove && (
              <Button
                type="button"
                size="sm"
                variant={pendingAction === "approve" ? "default" : "outline"}
                className="h-8 gap-1.5"
                onClick={() => openActionBar("approve")}
                disabled={isPending}
              >
                <Check className="h-3.5 w-3.5 text-green-600" />
                {t("inbox.approve")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant={pendingAction === "review" ? "default" : "outline"}
              className="h-8 gap-1.5"
              onClick={() => openActionBar("review")}
              disabled={isPending}
            >
              <Eye className="h-3.5 w-3.5 text-sky-600" />
              {t("inbox.review")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pendingAction === "suspend" ? "default" : "outline"}
              className="h-8 gap-1.5"
              onClick={() => openActionBar("suspend")}
              disabled={isPending}
            >
              <PauseCircle className="h-3.5 w-3.5 text-amber-600" />
              {t("inbox.suspend")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pendingAction === "block" ? "default" : "outline"}
              className="h-8 gap-1.5"
              onClick={() => openActionBar("block")}
              disabled={isPending}
            >
              <Ban className="h-3.5 w-3.5 text-red-600" />
              {t("inbox.block")}
            </Button>
          </div>

          {/* Inline action bar (appears when an action button is clicked).
              For Sospendi we show a "until when?" preset picker — the
              founder explicitly required it ("obbligatorio che venga chiesto
              fino a quando"). For the other actions we just show an
              optional-note field. */}
          {pendingAction && pendingAction === "suspend" && (
            <div className="flex flex-col gap-2 border-t border-border bg-amber-500/5 px-5 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <Clock className="h-3 w-3" />
                Sospendi fino a quando?
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suspendPresets.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      setSuspendUntil(p.value);
                      if (p.value !== "custom") {
                        setSuspendCustomDate("");
                      }
                    }}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] transition-colors",
                      suspendUntil === p.value
                        ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "border-border bg-background text-foreground/80 hover:bg-accent",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {suspendUntil === "custom" && (
                <input
                  type="datetime-local"
                  value={suspendCustomDate}
                  onChange={(e) => setSuspendCustomDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              )}
              <input
                type="text"
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmAction();
                  if (e.key === "Escape") cancelAction();
                }}
                placeholder="Motivo (opzionale)..."
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setSuspendUntil(null);
                    cancelAction();
                  }}
                >
                  Annulla
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => {
                    confirmAction();
                    setSuspendUntil(null);
                  }}
                  disabled={
                    !suspendUntil ||
                    (suspendUntil === "custom" && !suspendCustomDate)
                  }
                >
                  Conferma sospensione
                </Button>
              </div>
            </div>
          )}
          {pendingAction && pendingAction !== "suspend" && (
            <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-5 py-2">
              <input
                type="text"
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmAction();
                  if (e.key === "Escape") cancelAction();
                }}
                autoFocus
                placeholder="Nota opzionale (invio per confermare)..."
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button
                type="button"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={confirmAction}
                disabled={isPending}
              >
                Conferma
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={cancelAction}
              >
                Annulla
              </Button>
            </div>
          )}
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <DrawerBody item={item} issueById={issueById} />
        </div>

        {/* Comment history (only for items with an issue target) */}
        {chatTargetIssueId && (
          <CommentHistoryPanel issueId={chatTargetIssueId} agentById={agentById} />
        )}

        {/* Sticky chat footer — only rendered when there is an issue to post
            the comment against. For approvals/join-requests we hide it. */}
        {chatTargetIssueId ? (
          <footer className="shrink-0 border-t border-border bg-muted/20 px-5 py-3">
            <div className="flex items-end gap-2">
              <textarea
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={handleChatKey}
                placeholder="Scrivi all'agente... (Cmd+Enter per inviare)"
                rows={1}
                disabled={addCommentMutation.isPending}
                className="flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              />
              <Button
                type="button"
                size="sm"
                className="h-8 px-2.5 text-xs"
                disabled={!chatDraft.trim() || addCommentMutation.isPending}
                onClick={sendChat}
              >
                <Send className="mr-1 h-3 w-3" />
                {addCommentMutation.isPending ? "..." : "Invia"}
              </Button>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={wakeAgentOnSend}
                  onChange={(e) => setWakeAgentOnSend(e.target.checked)}
                  disabled={addCommentMutation.isPending}
                  className="h-3 w-3 cursor-pointer rounded border-border"
                />
                <span className={wakeAgentOnSend ? "text-foreground" : ""}>
                  Richiama l'agente
                </span>
              </label>
              {wakeAgentOnSend && chatTargetIsClosed && (
                <span className="text-amber-400/80">· riaprirà il task</span>
              )}
              {wakeAgentOnSend && chatTargetIsRunning && (
                <span className="text-amber-400/80">· interromperà il run in corso</span>
              )}
            </div>
            {addCommentMutation.isError && (
              <div className="mt-1 text-[10px] text-destructive">
                Errore invio — riprova. Dettagli in console.
              </div>
            )}
          </footer>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}
