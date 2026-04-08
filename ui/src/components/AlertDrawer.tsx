import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
  ChevronRight,
  FileText,
  Globe,
  ExternalLink,
  Download,
} from "lucide-react";
import { buildFileServeUrl, isPreviewableInBrowser } from "../lib/file-paths";
import type { Agent, Issue, IssueComment } from "@paperclipai/shared";
import type { InboxWorkItem, InboxItemContext } from "../lib/inbox";
import { ACTIONABLE_APPROVAL_STATUSES } from "../lib/inbox";
import { approvalLabel, ApprovalPayloadRenderer, defaultTypeIcon, typeIcon } from "./ApprovalPayload";
import { MarkdownBody } from "./MarkdownBody";
import { IssueResultsInline } from "./IssueResultsInline";
import { issuesApi } from "../api/issues";
import { activityApi, type RunForIssue } from "../api/activity";
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
type DrawerTab = "briefing" | "output" | "richiesta" | "messaggi";

type DetectedRequest = {
  commentId: string;
  /** Author label resolved from agent map, for display. */
  author: string;
  createdAt: string | Date;
  /** The snippet of the comment that actually contains the request. */
  snippet: string;
  /** The full comment body, for context / "Mostra completo". */
  fullBody: string;
};

// Keywords (whole-word, case-insensitive, Italian-first) that signal an
// agent is explicitly asking the user for a decision. The check is
// deliberately loose — false positives are OK here because the tab only
// *surfaces* the question, it doesn't act on it automatically.
const REQUEST_KEYWORDS = [
  "approvi", "approva", "approvazione",
  "confermi", "conferma",
  "procedo", "proseguo", "posso procedere", "posso continuare",
  "vuoi che", "devo",
  "va bene", "ok",
  "richiedo approvazione", "richiede approvazione",
  "feedback", "decisione",
];
const REQUEST_KEYWORD_RE = new RegExp(
  `\\b(?:${REQUEST_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i",
);

/**
 * Extract explicit requests from agent comments. We only look at the most
 * recent few agent-authored comments (user comments never contain a
 * request aimed at the user) and pick out the lines that either end with
 * `?` or contain one of the request keywords. The result is what the
 * "Richiesta" tab renders.
 */
function detectRequests(
  comments: IssueComment[],
  agentById?: Map<string, Agent>,
): DetectedRequest[] {
  if (!comments.length) return [];
  // Walk from newest to oldest. If the most recent entry is a USER reply
  // we treat the conversation as already answered: whatever question the
  // agent asked before it is now resolved, so we return no pending request.
  // This is what makes the "Richiesta" tab disappear after the user clicks
  // "Approva" (which posts a reply comment).
  const out: DetectedRequest[] = [];
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    // User already replied after the agent — request resolved.
    if (c.authorUserId) return out;
    // Only the agent asks the user for decisions. Skip system entries.
    if (!c.authorAgentId) continue;
    const body = c.body ?? "";
    if (!body) continue;
    // Split into sentences/lines and keep the ones that look like a request.
    // We split on both newlines and sentence-enders (? ! .) while keeping
    // the delimiter so trailing "?" survives the test below.
    const lines = body
      .split(/\n+/)
      .flatMap((line) => line.split(/(?<=[.!?])\s+/))
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const hits: string[] = [];
    for (const line of lines) {
      const endsWithQuestion = /\?\s*$/.test(line);
      const hasKeyword = REQUEST_KEYWORD_RE.test(line);
      // Avoid trivial hits like a single "ok?" line of noise — require at
      // least 8 characters so we don't pull in stuff like "?".
      if ((endsWithQuestion || hasKeyword) && line.length >= 8) {
        hits.push(line);
      }
    }
    if (hits.length === 0) continue;
    const agent = agentById?.get(c.authorAgentId);
    out.push({
      commentId: c.id,
      author: agent?.name ?? "Agente",
      createdAt: c.createdAt,
      // Join the hit lines with newlines so markdown renders them cleanly.
      // Cap to the first 4 to keep the tab tidy.
      snippet: hits.slice(0, 4).join("\n"),
      fullBody: body,
    });
    // Stop at the first agent comment that contains a request — we only
    // want to flag the *current* ask, not every question in the history.
    break;
  }
  return out;
}

// Extensions we consider "files" when scanning comment/run text. Kept in sync
// with ui/src/lib/file-paths.ts so what the drawer surfaces matches what the
// rest of the UI treats as a deliverable.
const DETECTABLE_FILE_EXTS = new Set([
  "html", "htm", "css", "js", "ts", "tsx", "jsx",
  "json", "md", "txt", "csv", "xml", "yaml", "yml",
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico",
  "pdf", "zip", "tar", "gz",
  "mp4", "webm", "mp3", "wav",
  "py", "rb", "go", "rs", "java", "php", "sh",
  "sql", "env", "toml", "lock", "log",
]);

type DetectedFile = {
  /** The original string as it appeared in the text. */
  path: string;
  /** Just the basename, for display. */
  name: string;
  extension: string;
  /** Absolute paths can be served via /api/local-files/serve — relative ones can't. */
  isAbsolute: boolean;
};

// Scan arbitrary text (comment bodies, run results) for anything that looks
// like a file path. This complements lib/file-paths.ts's detectFilePaths()
// which only handles absolute paths — agent comments very often list
// repo-relative paths like `packages/db/drizzle/0000_initial.sql`, which we
// want to surface in the Output tab as a file inventory.
//
// Strategy: pull every backtick-quoted token and every whitespace-delimited
// token, keep the ones that (a) contain a "/" (so `foo.ts` alone doesn't
// match random prose words) or (b) start with `/` or `~/`, and (c) end with a
// known extension. Dedupe by path.
function detectAllFiles(text: string): DetectedFile[] {
  if (!text) return [];
  const seen = new Map<string, DetectedFile>();

  const candidates: string[] = [];
  // 1) Backtick spans — the most reliable signal in markdown.
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    if (m[1]) candidates.push(m[1].trim());
  }
  // 2) Bare whitespace-delimited tokens that contain a slash. This catches
  //    paths written in table rows or bullet points without backticks.
  for (const raw of text.split(/[\s,;()"'<>]+/)) {
    if (raw && raw.includes("/")) candidates.push(raw);
  }

  for (const raw of candidates) {
    // Strip trailing punctuation the splitter didn't catch.
    const cleaned = raw.replace(/[.,;:!?)]+$/, "").trim();
    if (!cleaned) continue;
    // Must contain a dot for the extension check.
    const dot = cleaned.lastIndexOf(".");
    if (dot < 0 || dot === cleaned.length - 1) continue;
    const ext = cleaned.slice(dot + 1).toLowerCase();
    if (!DETECTABLE_FILE_EXTS.has(ext)) continue;
    // Reject URLs — they usually contain "://".
    if (cleaned.includes("://")) continue;
    // Require either a slash (so we have some path structure) or an absolute
    // prefix. A bare `foo.ts` is too noisy to include.
    const isAbsolute = cleaned.startsWith("/") || cleaned.startsWith("~/");
    if (!isAbsolute && !cleaned.includes("/")) continue;
    if (seen.has(cleaned)) continue;
    const name = cleaned.split("/").pop() ?? cleaned;
    seen.set(cleaned, { path: cleaned, name, extension: ext, isAbsolute });
  }

  return Array.from(seen.values());
}

/**
 * A collapsible panel used inside the Output tab. Renders its children
 * behind a click-to-expand header. Used as the "submenu" that the user
 * asked for — each output category (File, Risultati, Allegati) lives in
 * its own folded section so the tab stays tidy when there are many files.
 */
function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
            {title}
          </span>
          {typeof count === "number" && count > 0 && (
            <span className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold text-foreground/70">
              {count}
            </span>
          )}
        </div>
      </button>
      {open && <div className="border-t border-border/50 px-3 py-3">{children}</div>}
    </div>
  );
}

/** Tight chip used inside the "File" section of the Output tab. */
function FileChipCompact({ file }: { file: DetectedFile }) {
  const isHtml = file.extension === "html" || file.extension === "htm";
  const Icon = isHtml ? Globe : FileText;
  const serveUrl = file.isAbsolute ? buildFileServeUrl(file.path) : null;
  // Strip the basename so we can show the containing folder as a breadcrumb.
  const dir = file.path.slice(0, file.path.length - file.name.length).replace(/\/$/, "");
  const canOpen = !!serveUrl;
  const canPreview = canOpen && isPreviewableInBrowser(file.extension);

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          isHtml ? "text-blue-500" : "text-muted-foreground",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[12px] font-medium text-foreground" title={file.path}>
          {file.name}
        </span>
        {dir && (
          <span className="truncate text-[10px] text-muted-foreground" title={dir}>
            {dir}
          </span>
        )}
      </div>
      <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
        {file.extension}
      </span>
      {canPreview && serveUrl && (
        <button
          type="button"
          onClick={() => window.open(serveUrl, "_blank")}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Apri in nuova finestra"
        >
          <ExternalLink className="h-3 w-3" />
        </button>
      )}
      {canOpen && serveUrl && (
        <button
          type="button"
          onClick={() => {
            const a = document.createElement("a");
            a.href = serveUrl;
            a.download = file.name;
            a.click();
          }}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Scarica"
        >
          <Download className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// Normalize a raw linked run into the shape IssueResultsInline expects.
// Mirrors the logic in pages/IssueDetail.tsx so the drawer shows the same
// output the full-page view would show.
function buildRunResults(
  linkedRuns: RunForIssue[] | undefined,
  agentById?: Map<string, Agent>,
) {
  if (!linkedRuns || linkedRuns.length === 0) return [];
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
  for (const run of linkedRuns) {
    if (run.status !== "succeeded") continue;
    const result = (run.resultJson ?? null) as Record<string, unknown> | null;
    if (!result) continue;
    const content = typeof result.content === "string" ? (result.content as string) : null;
    if (!content || content.length === 0) continue;
    const usage = (run.usageJson ?? null) as Record<string, unknown> | null;
    const agent = agentById?.get(run.agentId);
    const pickNum = (...keys: string[]): number => {
      for (const k of keys) {
        const v = usage?.[k];
        if (typeof v === "number" && Number.isFinite(v)) return v;
      }
      return 0;
    };
    const modelCandidate = (result.model ?? usage?.model) as unknown;
    results.push({
      runId: run.runId,
      agentName: agent?.name ?? run.agentId.slice(0, 8),
      content,
      model: typeof modelCandidate === "string" ? modelCandidate : "unknown",
      costUsd: typeof usage?.costUsd === "number" ? (usage.costUsd as number) : 0,
      finishedAt: run.finishedAt ?? run.createdAt,
      inputTokens: pickNum("inputTokens", "input_tokens"),
      outputTokens: pickNum("outputTokens", "output_tokens"),
      cachedTokens: pickNum("cachedInputTokens", "cached_input_tokens", "cache_read_input_tokens"),
    });
  }
  return results;
}

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
      <div className="px-5 py-6 text-center text-[11px] text-muted-foreground">
        Caricamento commenti...
      </div>
    );
  }
  if (isError) {
    return (
      <div className="px-5 py-6 text-center text-[11px] text-destructive">
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
      <div className="px-5 py-10 text-center text-xs italic text-muted-foreground">
        Nessun commento. Scrivi il primo qui sotto.
      </div>
    );
  }

  // Show at most the last 50, newest at the bottom (chat convention).
  const recent = (comments as IssueComment[]).slice(-50);

  return (
    <div className="px-4 py-4">
      <div className="flex flex-col gap-3">
        {recent.map((c) => {
          const agent = c.authorAgentId && agentById ? agentById.get(c.authorAgentId) : null;
          const isUser = !!c.authorUserId;
          const authorLabel = agent
            ? agent.name
            : isUser
            ? "Tu"
            : "Sistema";
          const initial = (agent?.icon || authorLabel.slice(0, 1) || "?").toString();
          return (
            <div
              key={c.id}
              className={cn(
                "flex items-end gap-2",
                isUser ? "flex-row-reverse" : "flex-row",
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                  isUser
                    ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "border-primary/20 bg-primary/10 text-primary",
                )}
                title={authorLabel}
              >
                {initial}
              </div>
              {/* Bubble */}
              <div
                className={cn(
                  "max-w-[78%] rounded-2xl px-3 py-2 text-[12.5px] shadow-sm",
                  isUser
                    ? "rounded-br-sm border border-emerald-500/20 bg-emerald-500/10 text-foreground"
                    : "rounded-bl-sm border border-border bg-card text-foreground",
                )}
              >
                <div
                  className={cn(
                    "mb-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground",
                    isUser ? "justify-end" : "justify-start",
                  )}
                >
                  <span className="font-medium text-foreground/80">{authorLabel}</span>
                  <span className="opacity-60">·</span>
                  <span>{formatCommentTime(c.createdAt)}</span>
                </div>
                <MarkdownBody className="text-[12.5px] leading-snug">
                  {c.body}
                </MarkdownBody>
              </div>
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
          <span className="text-xs font-medium text-foreground/80">
            {approvalLabel(item.approval.type, payload)}
          </span>
        </div>
        {payload ? (
          <ApprovalPayloadRenderer type={item.approval.type} payload={payload} />
        ) : (
          <p className="text-xs text-muted-foreground">(nessun payload)</p>
        )}
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
  const [activeTab, setActiveTab] = useState<DrawerTab>("briefing");
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

  // Data for the tabbed drawer body (Briefing / Output / Messaggi). We only
  // enable these queries when there's a real issue target so approvals /
  // join-requests don't hit the API unnecessarily.
  const { data: drawerComments = [] } = useQuery({
    queryKey: queryKeys.issues.comments(chatTargetIssueId ?? "__none__"),
    queryFn: () => issuesApi.listComments(chatTargetIssueId!),
    enabled: !!chatTargetIssueId,
  });
  const { data: drawerAttachments = [] } = useQuery({
    queryKey: queryKeys.issues.attachments(chatTargetIssueId ?? "__none__"),
    queryFn: () => issuesApi.listAttachments(chatTargetIssueId!),
    enabled: !!chatTargetIssueId,
  });
  const { data: drawerLinkedRuns = [] } = useQuery({
    queryKey: queryKeys.issues.runs(chatTargetIssueId ?? "__none__"),
    queryFn: () => activityApi.runsForIssue(chatTargetIssueId!),
    enabled: !!chatTargetIssueId,
    refetchInterval: 5000,
  });
  const drawerRunResults = useMemo(
    () => buildRunResults(drawerLinkedRuns, agentById),
    [drawerLinkedRuns, agentById],
  );

  // Scan every comment body and run result for file-path tokens so the
  // Output tab can surface deliverables even when the agent communicated
  // via comments instead of a proper run result (the common Paperclip
  // pattern — e.g. Luca listing "132 file consegnati" in a chat message).
  const detectedFiles = useMemo<DetectedFile[]>(() => {
    const seen = new Map<string, DetectedFile>();
    const push = (text: string) => {
      for (const f of detectAllFiles(text)) {
        if (!seen.has(f.path)) seen.set(f.path, f);
      }
    };
    for (const c of drawerComments as IssueComment[]) {
      if (c.body) push(c.body);
    }
    for (const r of drawerRunResults) {
      if (r.content) push(r.content);
    }
    return Array.from(seen.values());
  }, [drawerComments, drawerRunResults]);

  const outputCount =
    detectedFiles.length + drawerRunResults.length + drawerAttachments.length;

  // Pull explicit approval/decision requests out of the agent comment
  // history so the user can spot them without scrolling the whole thread.
  const detectedRequests = useMemo(
    () => detectRequests(drawerComments as IssueComment[], agentById),
    [drawerComments, agentById],
  );
  const hasRequest = detectedRequests.length > 0;

  // Reset the active tab whenever we switch which item is displayed.
  // If the new item has an outstanding agent request we land directly on
  // the Richiesta tab so the user sees the pending ask first.
  useEffect(() => {
    setActiveTab("briefing");
  }, [item]);
  useEffect(() => {
    if (hasRequest) {
      setActiveTab("richiesta");
    } else {
      // Request got resolved (user replied / approved). If we were on the
      // Richiesta tab, fall back to Messaggi so the user can see the reply
      // landing, otherwise leave the current tab alone.
      setActiveTab((prev) => (prev === "richiesta" ? "messaggi" : prev));
    }
    // Only react when the request signal flips or the item changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRequest, item]);

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

  const canApproveApprovalItem =
    item.kind === "approval" &&
    item.approval.type !== "budget_override_required" &&
    ACTIONABLE_APPROVAL_STATUSES.has(item.approval.status) &&
    !!onApprove;
  // Comment-based approval: agent asked an explicit question in chat, we
  // let the user "Approva" directly from the drawer by posting a positive
  // reply comment that also wakes the agent.
  const canApproveFromRequest = hasRequest && !!chatTargetIssueId;
  const canApprove = canApproveApprovalItem || canApproveFromRequest;

  const openActionBar = (action: DrawerAction) => {
    setPendingAction(action);
    setActionNote("");
  };

  const confirmAction = () => {
    if (!pendingAction) return;
    const note = actionNote.trim();
    if (pendingAction === "approve") {
      if (canApproveApprovalItem) {
        onApprove?.(note);
      } else if (canApproveFromRequest) {
        // Comment-based approval: post a positive reply and wake the agent.
        // The note (if any) is appended so the user can explain the green
        // light in the same message.
        const body = note ? `✅ Approvato. Procedi.\n\n${note}` : "✅ Approvato. Procedi.";
        addCommentMutation.mutate({ body, wake: true });
      }
    }
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

        {/* Tab bar — shown only when there's an issue target. For
            approvals/join-requests we fall back to the classic single-body
            layout below. */}
        {chatTargetIssueId && (() => {
          type TabDef = {
            id: DrawerTab;
            label: string;
            count: number | null;
            highlight?: boolean;
          };
          const tabs: TabDef[] = [
            { id: "briefing", label: "Briefing", count: null },
            { id: "output", label: "Output", count: outputCount },
          ];
          if (hasRequest) {
            tabs.push({
              id: "richiesta",
              label: "Richiesta",
              count: detectedRequests.length,
              highlight: true,
            });
          }
          tabs.push({ id: "messaggi", label: "Messaggi", count: drawerComments.length });
          return (
            <div className="flex shrink-0 items-stretch border-b border-border bg-muted/20">
              {tabs.map((t) => {
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      "relative flex-1 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide transition-colors",
                      isActive
                        ? t.highlight
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-foreground"
                        : t.highlight
                        ? "text-amber-600/80 hover:text-amber-600 dark:text-amber-400/80 dark:hover:text-amber-400"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span>{t.label}</span>
                    {typeof t.count === "number" && t.count > 0 && (
                      <span
                        className={cn(
                          "ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-semibold",
                          t.highlight
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                            : "bg-muted text-foreground/70",
                        )}
                      >
                        {t.count}
                      </span>
                    )}
                    {isActive && (
                      <span
                        className={cn(
                          "absolute inset-x-2 bottom-0 h-0.5 rounded-full",
                          t.highlight ? "bg-amber-500" : "bg-primary",
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Scrollable body */}
        {chatTargetIssueId ? (
          <div className="flex-1 overflow-y-auto">
            {activeTab === "briefing" && (
              <div className="px-5 py-4">
                <DrawerBody item={item} issueById={issueById} />
              </div>
            )}
            {activeTab === "output" && (
              <div className="space-y-3 px-5 py-4">
                {detectedFiles.length > 0 && (
                  <CollapsibleSection
                    title="File"
                    count={detectedFiles.length}
                    defaultOpen
                  >
                    <div className="flex flex-col gap-1.5">
                      {detectedFiles.map((f) => (
                        <FileChipCompact key={f.path} file={f} />
                      ))}
                    </div>
                  </CollapsibleSection>
                )}
                {drawerRunResults.length > 0 && (
                  <CollapsibleSection
                    title="Risultati run"
                    count={drawerRunResults.length}
                    defaultOpen={detectedFiles.length === 0}
                  >
                    <IssueResultsInline runResults={drawerRunResults} />
                  </CollapsibleSection>
                )}
                {drawerAttachments.length > 0 && (
                  <CollapsibleSection
                    title="Allegati"
                    count={drawerAttachments.length}
                  >
                    <IssueAttachmentChips issueId={chatTargetIssueId} />
                  </CollapsibleSection>
                )}
                {outputCount === 0 && (
                  <div className="rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center text-xs italic text-muted-foreground">
                    Nessun output disponibile per questo task.
                  </div>
                )}
              </div>
            )}
            {activeTab === "richiesta" && (
              <div className="space-y-3 px-5 py-4">
                {detectedRequests.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center text-xs italic text-muted-foreground">
                    Nessuna richiesta esplicita rilevata.
                  </div>
                ) : (
                  detectedRequests.map((req) => (
                    <div
                      key={req.commentId}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"
                    >
                      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        <span className="font-semibold">Richiesta da {req.author}</span>
                        <span className="opacity-60">·</span>
                        <span>{formatCommentTime(req.createdAt)}</span>
                      </div>
                      <MarkdownBody className="text-sm text-foreground">
                        {req.snippet}
                      </MarkdownBody>
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => openActionBar("approve")}
                          disabled={addCommentMutation.isPending}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approva e procedi
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setActiveTab("messaggi")}
                        >
                          Vai al messaggio completo
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            {activeTab === "messaggi" && (
              <CommentHistoryPanel issueId={chatTargetIssueId} agentById={agentById} />
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <DrawerBody item={item} issueById={issueById} />
          </div>
        )}

        {/* Sticky chat footer — only rendered when there is an issue to post
            the comment against. For approvals/join-requests we hide it.
            Focusing the composer auto-switches to the Messaggi tab so the
            conversation context expands up and covers the other tabs. */}
        {chatTargetIssueId ? (
          <footer className="shrink-0 border-t border-border bg-muted/20 px-5 py-3">
            <div className="flex items-end gap-2">
              <textarea
                value={chatDraft}
                onChange={(e) => {
                  setChatDraft(e.target.value);
                  if (activeTab !== "messaggi") setActiveTab("messaggi");
                }}
                onFocus={() => {
                  if (activeTab !== "messaggi") setActiveTab("messaggi");
                }}
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
