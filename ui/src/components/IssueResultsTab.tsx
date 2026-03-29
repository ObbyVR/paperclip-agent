import { useTranslation } from "react-i18next";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";
import { relativeTime } from "../lib/utils";
import { estimateRunCostEur, modelLabel, formatEur } from "../lib/modelPricing";

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

export function IssueResultsTab({ runResults }: Props) {
  const { t } = useTranslation();

  if (runResults.length === 0) return null;

  return (
    <TabsContent value="results">
      <div className="space-y-4">
        {runResults.map((r) => {
          const isHtml = r.content.startsWith("```html") || r.content.startsWith("<!DOCTYPE") || r.content.startsWith("<html");
          const htmlContent = isHtml ? r.content.replace(/^```html\n?/, "").replace(/\n?```$/, "") : null;
          const estimatedEur = r.costUsd === 0
            ? estimateRunCostEur(r.model, r.inputTokens, r.outputTokens, r.cachedTokens)
            : null;
          return (
            <div key={r.runId} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{r.agentName}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground font-mono text-xs" title={r.model}>{modelLabel(r.model)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {r.costUsd > 0 && (
                    <span className="tabular-nums font-medium text-foreground">${r.costUsd.toFixed(4)}</span>
                  )}
                  {estimatedEur !== null && (
                    <span className="tabular-nums font-medium text-foreground" title="Stima equivalente costo API">
                      ~{formatEur(estimatedEur)}
                    </span>
                  )}
                  <span>{relativeTime(r.finishedAt)}</span>
                  {htmlContent && (
                    <>
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
                    </>
                  )}
                </div>
              </div>
              <div className="px-3 py-3 text-sm">
                {htmlContent ? (
                  <div className="border rounded bg-background">
                    <iframe
                      srcDoc={htmlContent}
                      className="w-full h-[500px] rounded"
                      sandbox="allow-scripts"
                      title={`Preview: ${r.agentName}`}
                    />
                  </div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                    {r.content}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </TabsContent>
  );
}
