import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Download, ExternalLink } from "lucide-react";
import { relativeTime } from "../lib/utils";
import { estimateRunCostEur, modelLabel, formatEur } from "../lib/modelPricing";
import { cn } from "../lib/utils";
import { FileOutputLinks } from "./FileOutputLinks";

type RunResult = {
  runId: string;
  agentName: string;
  content: string;
  model: string;
  costUsd: number;
  finishedAt: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
};

type Props = {
  runResults: RunResult[];
};

export function IssueResultsInline({ runResults }: Props) {
  const { t } = useTranslation();
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(() => {
    // Auto-expand the latest result
    if (runResults.length > 0) return new Set([runResults[runResults.length - 1].runId]);
    return new Set();
  });

  if (runResults.length === 0) return null;

  const toggleRun = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Output ({runResults.length})
      </h3>
      {runResults.map((r) => {
        const isHtml = r.content.startsWith("```html") || r.content.startsWith("<!DOCTYPE") || r.content.startsWith("<html");
        const htmlContent = isHtml ? r.content.replace(/^```html\n?/, "").replace(/\n?```$/, "") : null;
        const estimatedEur = r.costUsd === 0
          ? estimateRunCostEur(r.model, r.inputTokens, r.outputTokens, r.cachedTokens)
          : null;
        const isExpanded = expandedRuns.has(r.runId);

        return (
          <div key={r.runId} className="border border-border rounded-lg overflow-hidden">
            {/* Header — always visible, clickable */}
            <button
              type="button"
              className="flex items-center justify-between w-full px-3 py-2.5 bg-muted/30 border-b border-border text-left hover:bg-muted/50 transition-colors"
              onClick={() => toggleRun(r.runId)}
            >
              <div className="flex items-center gap-2 text-sm min-w-0">
                {isExpanded
                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className="font-medium truncate">{r.agentName}</span>
                <span className="text-muted-foreground font-mono text-xs shrink-0" title={r.model}>{modelLabel(r.model)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                {r.costUsd > 0 && (
                  <span className="tabular-nums font-medium text-foreground">${r.costUsd.toFixed(4)}</span>
                )}
                {estimatedEur !== null && (
                  <span className="tabular-nums font-medium text-foreground" title="Stima costo API">
                    ~{formatEur(estimatedEur)}
                  </span>
                )}
                <span>{relativeTime(r.finishedAt)}</span>
              </div>
            </button>

            {/* Content — collapsible */}
            {isExpanded && (
              <div className="px-3 py-3 text-sm">
                {htmlContent ? (
                  <div className="space-y-2">
                    <FileOutputLinks content={r.content} />
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title={t("issueDetail.openNewWindow")}
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
                        title={t("issueDetail.downloadHtml")}
                        onClick={() => {
                          const blob = new Blob([htmlContent], { type: "text/html" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${r.agentName.replace(/\s+/g, "-").toLowerCase()}-result.html`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="border rounded bg-background">
                      <iframe
                        srcDoc={htmlContent}
                        className="w-full h-[500px] rounded"
                        sandbox="allow-scripts"
                        title={`Preview: ${r.agentName}`}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                      {r.content}
                    </div>
                    <FileOutputLinks content={r.content} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
