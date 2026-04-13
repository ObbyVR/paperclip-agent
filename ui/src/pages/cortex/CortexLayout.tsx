import { useState, useEffect, useCallback, useMemo } from "react";
import { Outlet, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { issuesApi } from "@/api/issues";
import { queryKeys } from "@/lib/queryKeys";
import { CortexSidebar } from "@/components/cortex/CortexSidebar";
import { CommandPalette } from "@/components/cortex/CommandPalette";
import { KeyboardHelp } from "@/components/cortex/KeyboardHelp";

export function CortexLayout() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const location = useLocation();
  const { selectedCompanyId } = useCompany();

  // Fetch issues for tab title badge
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const urgentCount = useMemo(
    () => (issues ?? []).filter((i) => i.status === "blocked" || i.status === "in_review").length,
    [issues],
  );

  // Update document title with badge
  useEffect(() => {
    document.title = urgentCount > 0 ? `(${urgentCount}) Cortex` : "Cortex";
    return () => { document.title = "Paperclip"; };
  }, [urgentCount]);

  // Extract base path segment for route-level key (ignore nested params)
  const routeKey = location.pathname.split("/").slice(0, 4).join("/");

  // Global shortcuts: Cmd+K for palette, ? for help
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      // ? key (not in an input)
      if (e.key === "?" && !paletteOpen && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteOpen]);

  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#060810] text-[#e4e7ef]" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <CortexSidebar
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <div key={routeKey} className="flex h-full flex-col animate-[cortex-fade-in_0.2s_ease-out]">
          <Outlet context={{ selectedProjectId, setSelectedProjectId, onMobileMenuOpen: () => setMobileMenuOpen(true), onSearchOpen: () => setPaletteOpen(true) }} />
        </div>
      </main>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <KeyboardHelp open={helpOpen} onClose={closeHelp} />
    </div>
  );
}
