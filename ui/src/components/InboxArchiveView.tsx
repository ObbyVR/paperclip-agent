import { useMemo, useState } from "react";
import { Archive, RotateCcw, Search } from "lucide-react";
import type { Agent, Issue, Project } from "@paperclipai/shared";
import { EmptyState } from "./EmptyState";
import { PageSkeleton } from "./PageSkeleton";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";

/**
 * InboxArchiveView — a read-only list of every issue the current user has
 * archived from their inbox. Lets them search/filter and restore items back
 * into the active inbox. The data source is `issuesApi.list` with
 * `inboxArchivedOnlyForUserId=me`, wired in Inbox.tsx.
 *
 * Design choices:
 *   - Single flat list (no per-project grouping) since the primary use case
 *     is "find that thing I archived yesterday" and projects would fragment it
 *   - Newest-first by updatedAt — archives are ordered by recency of the
 *     underlying issue, not archive time, so a reactivated issue surfaces.
 *   - Inline "Ripristina" button per row that calls back to the parent; the
 *     parent triggers the actual mutation + query invalidation.
 *   - Client-side text filter (title / identifier / project name) — the
 *     archive list shouldn't get large enough to need server-side search.
 */
interface InboxArchiveViewProps {
  issues: Issue[];
  isLoading: boolean;
  projectById: Map<string, Project>;
  agentById: Map<string, Agent>;
  onRestore: (id: string) => void;
  restoringIds: Set<string>;
}

function formatRelative(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s fa`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h fa`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}g fa`;
  return d.toLocaleDateString();
}

export function InboxArchiveView({
  issues,
  isLoading,
  projectById,
  agentById,
  onRestore,
  restoringIds,
}: InboxArchiveViewProps) {
  const [query, setQuery] = useState("");

  const sortedIssues = useMemo(() => {
    // Newest updated first — gives the most likely "I need this back" item
    // top placement. `updatedAt` is always populated by the schema default.
    return [...issues].sort((a, b) => {
      const at = new Date(a.updatedAt).getTime();
      const bt = new Date(b.updatedAt).getTime();
      return bt - at;
    });
  }, [issues]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedIssues;
    return sortedIssues.filter((issue) => {
      const hay = [
        issue.title,
        issue.identifier ?? "",
        issue.description ?? "",
        issue.projectId ? projectById.get(issue.projectId)?.name ?? "" : "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query, sortedIssues, projectById]);

  if (isLoading && issues.length === 0) {
    return <PageSkeleton variant="inbox" />;
  }

  if (!isLoading && issues.length === 0) {
    return (
      <EmptyState
        icon={Archive}
        message="Nessun alert archiviato. Usa il pulsante archivio in Posta in arrivo per stashare qui gli elementi gestiti."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per titolo, identificatore o progetto..."
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">
          {filtered.length} / {issues.length}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 py-6 text-center text-xs italic text-muted-foreground">
          Nessun risultato per la ricerca.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {filtered.map((issue) => {
            const project = issue.projectId ? projectById.get(issue.projectId) : null;
            const agent = issue.assigneeAgentId
              ? agentById.get(issue.assigneeAgentId)
              : null;
            const isRestoring = restoringIds.has(issue.id);
            return (
              <div
                key={issue.id}
                className={cn(
                  "group flex items-start gap-3 border-b border-border px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-accent/30",
                )}
              >
                <Archive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-medium text-foreground">{issue.title}</span>
                    {issue.identifier && (
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {issue.identifier}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {project && <span>{project.name}</span>}
                    {agent && (
                      <span>
                        {agent.icon ? `${agent.icon} ` : ""}
                        {agent.name}
                      </span>
                    )}
                    <span>Stato: {issue.status}</span>
                    <span>Aggiornato {formatRelative(issue.updatedAt)}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1.5 px-2 text-xs"
                  onClick={() => onRestore(issue.id)}
                  disabled={isRestoring}
                  title="Ripristina in Posta in arrivo"
                >
                  <RotateCcw className="h-3 w-3" />
                  {isRestoring ? "..." : "Ripristina"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
