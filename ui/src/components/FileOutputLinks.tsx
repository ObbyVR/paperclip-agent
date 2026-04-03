import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Download, FileText, Globe, Eye, EyeOff } from "lucide-react";
import { detectFilePaths, buildFileServeUrl, isHtmlFile, isPreviewableInBrowser, type FileReference } from "../lib/file-paths";

type Props = {
  content: string;
  label?: string;
};

function FileChip({ file }: { file: FileReference }) {
  const [showPreview, setShowPreview] = useState(false);
  const serveUrl = buildFileServeUrl(file.path);
  const html = isHtmlFile(file.extension);
  const previewable = isPreviewableInBrowser(file.extension);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {html ? (
            <Globe className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="text-sm font-medium truncate">{file.name}</span>
          <span className="text-xs text-muted-foreground uppercase">{file.extension}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {previewable && (
            <Button
              variant="ghost"
              size="icon-xs"
              title={showPreview ? "Nascondi anteprima" : "Mostra anteprima"}
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            title="Apri in nuova finestra"
            onClick={() => window.open(serveUrl, "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Scarica"
            onClick={() => {
              const a = document.createElement("a");
              a.href = serveUrl;
              a.download = file.name;
              a.click();
            }}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {showPreview && (
        <div className="bg-background">
          {html ? (
            <iframe
              src={serveUrl}
              className="w-full h-[500px]"
              sandbox="allow-scripts allow-same-origin"
              title={`Preview: ${file.name}`}
            />
          ) : file.extension === "pdf" ? (
            <iframe
              src={serveUrl}
              className="w-full h-[500px]"
              title={`Preview: ${file.name}`}
            />
          ) : ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(file.extension) ? (
            <div className="p-4 flex justify-center">
              <img src={serveUrl} alt={file.name} className="max-h-[500px] max-w-full object-contain" />
            </div>
          ) : (
            <iframe
              src={serveUrl}
              className="w-full h-[300px]"
              title={`Preview: ${file.name}`}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Detects file paths in text content and renders them as clickable file chips.
 * Use anywhere agent output is displayed (issue detail, approvals, comments, etc.)
 */
export function FileOutputLinks({ content, label }: Props) {
  const files = detectFilePaths(content);
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      {label && (
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</h4>
      )}
      {files.map((file) => (
        <FileChip key={file.path} file={file} />
      ))}
    </div>
  );
}
