import { useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { MessageCircle } from "lucide-react";
import { OutputPreviewCard } from "./OutputPreviewCard";
import { FilePill } from "./FilePill";

/**
 * Rewrite internal Paperclip links to point to Cortex routes.
 * E.g. /WEB/issues/WEB-123 → /WEB/cortex/issues/<id>
 *      /WEB/inbox → /WEB/cortex/inbox
 */
function rewriteInternalUrl(url: string): string {
  // Match /:prefix/issues/:id or /:prefix/inbox etc. (not already /cortex/)
  return url
    .replace(/\/([^/]+)\/(inbox|issues|dashboard|settings)(\/|$)/g, (match, prefix, page, trail) => {
      if (match.includes("/cortex/")) return match;
      return `/${prefix}/cortex/${page}${trail}`;
    });
}

/** Minimal markdown-to-HTML for chat bubbles */
function miniMarkdown(text: string): string {
  // Escape HTML
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Process line by line for block elements
  html = html
    .split("\n")
    .map((line) => {
      // Headings: ## Title or ### Subtitle
      if (/^###\s+(.+)$/.test(line)) {
        return `<div class="text-[12px] font-semibold text-white/70 mt-2 mb-0.5">${line.replace(/^###\s+/, "")}</div>`;
      }
      if (/^##\s+(.+)$/.test(line)) {
        return `<div class="text-[14px] font-semibold text-white/90 mt-2 mb-1">${line.replace(/^##\s+/, "")}</div>`;
      }
      // List items: - item
      if (/^\s*-\s+(.+)$/.test(line)) {
        const content = line.replace(/^\s*-\s+/, "");
        return `<div class="flex gap-1.5 pl-1"><span class="text-white/35 mt-[2px]">•</span><span>${content}</span></div>`;
      }
      return line;
    })
    .join("\n");

  // Inline formatting
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white/90">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="rounded bg-white/[0.08] px-1.5 py-0.5 text-[11px] font-mono text-white/70">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
      const rewritten = rewriteInternalUrl(url);
      return `<a href="${rewritten}" target="_blank" rel="noreferrer" class="text-indigo-400 underline decoration-indigo-400/30 hover:decoration-indigo-400">${label}</a>`;
    });

  // Remaining newlines → <br>
  html = html.replace(/\n/g, "<br>");

  return html;
}

export interface ChatMessage {
  id: string;
  from: "agent" | "ceo";
  /** Plain text body (newlines preserved via CSS white-space) */
  text: string;
  timestamp: string;
  outputPreview?: { name: string; openUrl?: string };
  files?: Array<{ icon?: string; name: string; size?: string; href?: string }>;
}

interface MaskChatProps {
  messages: ChatMessage[];
  isLoading?: boolean;
}

export function MaskChat({ messages, isLoading }: MaskChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-3 px-5 py-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className={cn("h-16 rounded-xl animate-pulse", i % 2 === 1 ? "self-start w-[70%] bg-white/[0.04]" : "self-end w-[55%] bg-indigo-600/20")} />
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/35">
        <MessageCircle className="h-8 w-8 text-white/15" />
        <span className="text-[12px]">Nessun messaggio</span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4">
      {messages.map((msg) => (
        <div key={msg.id} className={cn(
          "max-w-[84%] px-3.5 py-2.5 text-[13px] leading-[1.55]",
          msg.from === "agent" ? "self-start rounded-xl rounded-bl-sm border border-white/[0.06] bg-[#161a27]" : "self-end rounded-xl rounded-br-sm bg-indigo-600 text-white",
        )}>
          <div className="whitespace-pre-wrap break-words [&_br+br]:block [&_br+br]:h-1" dangerouslySetInnerHTML={{ __html: miniMarkdown(msg.text) }} />
          {msg.outputPreview && <OutputPreviewCard name={msg.outputPreview.name} openUrl={msg.outputPreview.openUrl} />}
          {msg.files?.map((f) => <FilePill key={f.name} {...f} />)}
          <div className={cn("mt-1 text-[10px]", msg.from === "agent" ? "text-white/45" : "text-white/45")}>{msg.timestamp}</div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
