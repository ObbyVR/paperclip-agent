import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { activityApi, type RunForIssue } from "../api/activity";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Mail, Globe } from "lucide-react";
import type { Issue } from "@paperclipai/shared";
import { FileOutputLinks } from "./FileOutputLinks";

type Props = {
  linkedIssues: Issue[];
  companyId: string;
};

function extractContent(run: RunForIssue): string | null {
  const rj = run.resultJson;
  if (!rj) return null;
  if (typeof rj.content === "string" && rj.content.length > 0) return rj.content;
  // Some runs store content in report.sections
  if (rj.report && typeof rj.report === "object") {
    const report = rj.report as Record<string, unknown>;
    if (typeof report.content === "string") return report.content;
    // Try to reconstruct from sections
    if (Array.isArray(report.sections)) {
      const parts = (report.sections as Array<Record<string, unknown>>)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
        .map((s) => `## ${s.title ?? ""}\n\n${s.content ?? ""}`)
        .join("\n\n");
      return parts || null;
    }
  }
  return null;
}

function isHtmlContent(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("```html")
  );
}

function isEmailContent(title: string): boolean {
  const lower = title.toLowerCase();
  return lower.includes("email") || lower.includes("outreach") || lower.includes("mail");
}

function isAuditContent(title: string): boolean {
  const lower = title.toLowerCase();
  return lower.includes("audit");
}

function cleanHtml(content: string): string {
  return content.replace(/^```html\n?/, "").replace(/\n?```$/, "");
}

function HtmlPreview({ content, title }: { content: string; title: string }) {
  const { t } = useTranslation();
  const htmlContent = cleanHtml(content);

  return (
    <div className="space-y-3">
      <FileOutputLinks content={content} />
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-2 text-sm">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{t("approval.htmlPreview")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon-xs"
              title={t("approval.openInBrowser")}
              onClick={() => {
                const w = window.open("", "_blank");
                if (w) { w.document.write(htmlContent); w.document.close(); }
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title={t("approval.downloadHtml")}
              onClick={() => {
                const blob = new Blob([htmlContent], { type: "text/html" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${title.replace(/\s+/g, "-").toLowerCase()}.html`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <iframe
          srcDoc={htmlContent}
          className="w-full h-[500px] rounded-b"
          sandbox="allow-scripts"
          title={`Preview: ${title}`}
        />
      </div>
    </div>
  );
}

function EmailPreview({ content, title }: { content: string; title: string }) {
  const { t } = useTranslation();

  // Try to parse as JSON (email outreach format)
  let emailData: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object") emailData = parsed;
  } catch {
    // Not JSON, render as markdown-like content
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border text-sm">
        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{t("approval.emailPreview")}</span>
      </div>
      <div className="bg-background p-4">
        {/* Email-style card */}
        <div className="max-w-2xl mx-auto border border-border/60 rounded-lg shadow-sm">
          {/* Email header */}
          <div className="border-b border-border/60 px-4 py-3 bg-muted/20 rounded-t-lg space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground w-8 text-xs">A:</span>
              <span className="font-medium">{title.replace(/^(Email|Review)[\s—:]+/i, "")}</span>
            </div>
          </div>
          {/* Email body */}
          <div className="px-4 py-4 text-sm whitespace-pre-wrap leading-relaxed prose prose-sm dark:prose-invert max-w-none">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditPreview({ content, title }: { content: string; title: string }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border text-sm">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">Report Audit</span>
      </div>
      <div className="px-4 py-3 text-sm prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap max-h-[500px] overflow-y-auto">
        {content}
      </div>
    </div>
  );
}

function GenericPreview({ content }: { content: string }) {
  return (
    <div className="space-y-3">
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 text-sm prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap max-h-[400px] overflow-y-auto">
          {content}
        </div>
      </div>
      <FileOutputLinks content={content} />
    </div>
  );
}

function IssueOutputPreview({ issue, companyId }: { issue: Issue; companyId: string }) {
  const { data: runs, isLoading } = useQuery({
    queryKey: queryKeys.issues.runs(issue.id),
    queryFn: () => activityApi.runsForIssue(issue.id),
    enabled: !!issue.id,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents ?? []) map.set(agent.id, agent.name);
    return map;
  }, [agents]);

  if (isLoading) {
    return (
      <div className="animate-pulse bg-muted/30 rounded-lg h-24 flex items-center justify-center">
        <span className="text-xs text-muted-foreground">Caricamento anteprima...</span>
      </div>
    );
  }

  // Find completed runs with content
  const completedRuns = (runs ?? [])
    .filter((r) => r.status === "succeeded" || r.status === "completed")
    .sort((a, b) => new Date(b.finishedAt ?? b.createdAt).getTime() - new Date(a.finishedAt ?? a.createdAt).getTime());

  if (completedRuns.length === 0) return null;

  return (
    <div className="space-y-3">
      {completedRuns.map((run) => {
        const content = extractContent(run);
        if (!content) return null;

        const agentName = agentNameById.get(run.agentId) ?? "Agente";
        const title = issue.title;

        // Detect content type
        if (isHtmlContent(content)) {
          return (
            <div key={run.runId}>
              <p className="text-xs text-muted-foreground mb-1.5">
                Output di <span className="font-medium">{agentName}</span> per <span className="font-medium">{title}</span>
              </p>
              <HtmlPreview content={content} title={title} />
            </div>
          );
        }

        if (isEmailContent(title)) {
          return (
            <div key={run.runId}>
              <p className="text-xs text-muted-foreground mb-1.5">
                Output di <span className="font-medium">{agentName}</span>
              </p>
              <EmailPreview content={content} title={title} />
            </div>
          );
        }

        if (isAuditContent(title)) {
          return (
            <div key={run.runId}>
              <p className="text-xs text-muted-foreground mb-1.5">
                Output di <span className="font-medium">{agentName}</span>
              </p>
              <AuditPreview content={content} title={title} />
            </div>
          );
        }

        return (
          <div key={run.runId}>
            <p className="text-xs text-muted-foreground mb-1.5">
              Output di <span className="font-medium">{agentName}</span>
            </p>
            <GenericPreview content={content} />
          </div>
        );
      })}
    </div>
  );
}

export function ApprovalOutputPreview({ linkedIssues, companyId }: Props) {
  const { t } = useTranslation();

  if (!linkedIssues || linkedIssues.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">{t("approval.previewOutput")}</h3>
      {linkedIssues.map((issue) => (
        <IssueOutputPreview key={issue.id} issue={issue} companyId={companyId} />
      ))}
    </div>
  );
}
