import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { projectsApi } from "@/api/projects";
import { issuesApi } from "@/api/issues";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { Search, ArrowRight, Sun, Inbox, CircleDot, Monitor, DollarSign, Settings, FolderOpen, ClipboardList } from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  action: () => void;
  category: "nav" | "project" | "issue" | "agent";
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });

  const allItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [];

    // Nav items
    const iconCls = "h-4 w-4 text-white/40";
    const navItems: Array<{ id: string; label: string; icon: React.ReactNode; path: string }> = [
      { id: "nav-dashboard", label: "Dashboard", icon: <Sun className={iconCls} />, path: "dashboard" },
      { id: "nav-inbox", label: "Inbox", icon: <Inbox className={iconCls} />, path: "inbox" },
      { id: "nav-issues", label: "Issues", icon: <CircleDot className={iconCls} />, path: "issues" },
      { id: "nav-office", label: "Pixel Office", icon: <Monitor className={iconCls} />, path: "office" },
      { id: "nav-costs", label: "Costi", icon: <DollarSign className={iconCls} />, path: "costs" },
      { id: "nav-settings", label: "Settings", icon: <Settings className={iconCls} />, path: "settings" },
    ];
    for (const n of navItems) {
      items.push({ ...n, category: "nav", action: () => { navigate(n.path); onClose(); } });
    }

    // Projects
    for (const p of (projects ?? []).filter((p) => !p.archivedAt)) {
      items.push({
        id: `proj-${p.id}`,
        label: p.name,
        sublabel: "Progetto",
        icon: <FolderOpen className="h-4 w-4 text-white/40" />,
        category: "project",
        action: () => { navigate("dashboard"); onClose(); },
      });
    }

    // Recent issues (top 20 by updatedAt)
    const recentIssues = [...(issues ?? [])]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 20);
    for (const i of recentIssues) {
      const agent = i.assigneeAgentId ? (agents ?? []).find((a) => a.id === i.assigneeAgentId) : null;
      items.push({
        id: `issue-${i.id}`,
        label: i.title,
        sublabel: [i.identifier, agent?.name].filter(Boolean).join(" · "),
        icon: <ClipboardList className="h-4 w-4 text-white/40" />,
        category: "issue",
        action: () => { navigate(`issues/${i.id}`); onClose(); },
      });
    }

    return items;
  }, [projects, issues, agents, navigate, onClose]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 12);
    const q = query.toLowerCase();
    return allItems
      .filter((i) =>
        i.label.toLowerCase().includes(q) ||
        (i.sublabel ?? "").toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [allItems, query]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard nav
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIdx]) {
      e.preventDefault();
      filtered[selectedIdx].action();
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [filtered, selectedIdx, onClose]);

  // Reset selection on query change
  useEffect(() => { setSelectedIdx(0); }, [query]);

  // Global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const CATEGORY_LABEL: Record<string, string> = { nav: "Navigazione", project: "Progetti", issue: "Issue recenti", agent: "Agenti" };
  let lastCategory = "";

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-[18%] z-[101] w-[90vw] max-w-[520px] -translate-x-1/2 overflow-hidden rounded-xl border border-white/[0.08] bg-[#10131d] shadow-[0_24px_80px_rgba(0,0,0,0.7)]">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-white/35" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cerca pagine, progetti, issue..."
            className="flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/30"
          />
          <kbd className="hidden rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/35 sm:inline">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-[12px] text-white/35">Nessun risultato</div>
          )}
          {filtered.map((item, i) => {
            const showCategory = item.category !== lastCategory;
            lastCategory = item.category;
            return (
              <div key={item.id}>
                {showCategory && (
                  <div className="px-4 pb-1 pt-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/25">
                    {CATEGORY_LABEL[item.category]}
                  </div>
                )}
                <button
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                    selectedIdx === i ? "bg-indigo-400/[0.12]" : "hover:bg-white/[0.03]",
                  )}
                >
                  <span className="flex w-5 items-center justify-center">{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-medium text-white">{item.label}</span>
                    {item.sublabel && (
                      <span className="ml-2 text-[11px] text-white/40">{item.sublabel}</span>
                    )}
                  </div>
                  {selectedIdx === i && <ArrowRight className="h-3 w-3 shrink-0 text-indigo-400" />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2 text-[10px] text-white/25">
          <span><kbd className="rounded border border-white/[0.06] px-1 py-0.5">↑↓</kbd> naviga</span>
          <span><kbd className="rounded border border-white/[0.06] px-1 py-0.5">↵</kbd> apri</span>
          <span><kbd className="rounded border border-white/[0.06] px-1 py-0.5">esc</kbd> chiudi</span>
        </div>
      </div>
    </>
  );
}
