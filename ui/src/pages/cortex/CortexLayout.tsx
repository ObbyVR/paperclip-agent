import { useState } from "react";
import { Outlet } from "@/lib/router";
import { CortexSidebar } from "@/components/cortex/CortexSidebar";

export function CortexLayout() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#060810] text-[#e4e7ef]" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <CortexSidebar
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
      />
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <Outlet context={{ selectedProjectId, setSelectedProjectId }} />
      </main>
    </div>
  );
}
