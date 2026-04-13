import { useState, useEffect, useCallback } from "react";
import { Outlet, useLocation } from "@/lib/router";
import { CortexSidebar } from "@/components/cortex/CortexSidebar";
import { CommandPalette } from "@/components/cortex/CommandPalette";

export function CortexLayout() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();

  // Extract base path segment for route-level key (ignore nested params)
  const routeKey = location.pathname.split("/").slice(0, 4).join("/");

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const closePalette = useCallback(() => setPaletteOpen(false), []);

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
    </div>
  );
}
