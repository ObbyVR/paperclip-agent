import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Eye, EyeOff, FileText, FolderOpen, Globe, Image as ImageIcon } from "lucide-react";
import { buildFileServeUrl } from "../lib/file-paths";
import { executionWorkspacesApi } from "../api/execution-workspaces";

type WorkspaceFile = {
  name: string;
  path: string;
  size: number;
  type: string;
  modifiedAt: string;
};

type ListResponse = {
  dir: string;
  files: WorkspaceFile[];
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith("text/html")) return <Globe className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
  if (type.startsWith("image/")) return <ImageIcon className="h-3.5 w-3.5 text-purple-500 shrink-0" />;
  return <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

function isPreviewable(type: string): boolean {
  return type.startsWith("text/html") || type.startsWith("image/") || type === "application/pdf";
}

function FileRow({ file }: { file: WorkspaceFile }) {
  const [showPreview, setShowPreview] = useState(false);
  const serveUrl = buildFileServeUrl(file.path);
  const previewable = isPreviewable(file.type);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
        {fileIcon(file.type)}
        <span className="text-sm font-medium truncate flex-1">{file.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(file.size)}</span>
        <div className="flex items-center gap-1 shrink-0">
          {previewable && (
            <Button
              variant="ghost"
              size="icon-xs"
              title={showPreview ? "Nascondi" : "Anteprima"}
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
          {file.type.startsWith("text/html") ? (
            <iframe
              src={serveUrl}
              className="w-full h-[500px]"
              sandbox="allow-scripts allow-same-origin"
              title={`Preview: ${file.name}`}
            />
          ) : file.type.startsWith("image/") ? (
            <div className="p-4 flex justify-center">
              <img src={serveUrl} alt={file.name} className="max-h-[400px] max-w-full object-contain" />
            </div>
          ) : file.type === "application/pdf" ? (
            <iframe src={serveUrl} className="w-full h-[500px]" title={`Preview: ${file.name}`} />
          ) : null}
        </div>
      )}
    </div>
  );
}

type Props =
  | { workspaceCwd: string; companyId?: never; issueId?: never }
  | { workspaceCwd?: never; companyId: string; issueId: string };

export function WorkspaceFileBrowser(props: Props) {
  // If we have a direct cwd, use it. Otherwise, look up the workspace by issue.
  const { data: workspaces } = useQuery({
    queryKey: ["issue-execution-workspaces", props.companyId, props.issueId],
    queryFn: () => executionWorkspacesApi.list(props.companyId!, { issueId: props.issueId }),
    enabled: !!props.companyId && !!props.issueId && !props.workspaceCwd,
    staleTime: 60_000,
  });

  const workspaceCwd = props.workspaceCwd ?? workspaces?.[0]?.cwd ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["workspace-files", workspaceCwd],
    queryFn: () => api.get<ListResponse>(`/local-files/list?dir=${encodeURIComponent(workspaceCwd!)}`),
    enabled: !!workspaceCwd,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="animate-pulse bg-muted/30 rounded-lg h-12 flex items-center justify-center">
        <span className="text-xs text-muted-foreground">Caricamento file...</span>
      </div>
    );
  }

  const files = data?.files ?? [];
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          File workspace ({files.length})
        </h3>
      </div>
      <div className="space-y-1.5">
        {files.map((file) => (
          <FileRow key={file.path} file={file} />
        ))}
      </div>
    </div>
  );
}
