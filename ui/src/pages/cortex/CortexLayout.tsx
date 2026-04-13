import { useState } from "react";
import { Outlet, useLocation } from "@/lib/router";
import { CortexSidebar } from "@/components/cortex/CortexSidebar";

export function CortexLayout() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Extract base path segment for route-level key (ignore nested params)
  const routeKey = location.pathname.split("/").slice(0, 4).join("/");

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
          <Outlet context={{ selectedProjectId, setSelectedProjectId, onMobileMenuOpen: () => setMobileMenuOpen(true) }} />
        </div>
      </main>
    </div>
  );
}
