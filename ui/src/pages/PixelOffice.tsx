/**
 * PixelOffice v11 — Three.js 3D low-poly rebuild.
 *
 * Single WebGL canvas for the entire office (floor, walls, window, furniture,
 * agents, lighting, shadows, dust particles). Header bar with search & stats
 * is preserved. Old CSS+canvas compositing is gone (see D117).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { AgentChatSheet } from "../components/AgentChatSheet";
import { WallClock } from "../components/office";
import { AmbientSound } from "../components/office/AmbientSound";
import { OfficeScene } from "../components/office3d/OfficeScene";
import type { Agent } from "@paperclipai/shared";

/* ── Header bar color: warm dark brown to match 3D scene ── */
const HEADER_BG = "#1a1008";

export function PixelOffice() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sceneReady, setSceneReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fallback: force loading overlay off after 3s even if the Canvas never
  // fires its onCreated callback (e.g. WebGL context lost, slow GPU).
  useEffect(() => {
    const t = setTimeout(() => setSceneReady(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { setBreadcrumbs([{ label: "Ufficio" }]); }, [setBreadcrumbs]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  /* ── Data ── */
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 15000,
  });

  const activeAgents = useMemo(
    () => (agents ?? []).filter((a) => a.status !== "terminated"),
    [agents],
  );

  const statusCounts = useMemo(() => {
    const c = { active: 0, idle: 0, paused: 0, error: 0 };
    for (const a of activeAgents) {
      if (a.status === "active" || a.status === "running") c.active++;
      else if (a.status === "paused") c.paused++;
      else if (a.status === "error") c.error++;
      else c.idle++;
    }
    return c;
  }, [activeAgents]);

  /* ── Search filter (name/role substring) ── */
  const searchLower = searchQuery.toLowerCase();
  const filteredAgents = useMemo(() => {
    if (!searchLower) return activeAgents;
    return activeAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(searchLower) ||
        (a.role ?? "").toLowerCase().includes(searchLower),
    );
  }, [activeAgents, searchLower]);

  /* ── Keyboard: Escape closes chat / clears search (on window listener) ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setChatAgent(null);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-[calc(100vh-48px)] outline-none"
      style={{ backgroundColor: HEADER_BG }}
    >
      {/* Header — responsive: wraps on mobile */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-border"
        style={{ backgroundColor: HEADER_BG }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs sm:text-sm font-semibold text-violet-400 tracking-wide">UFFICIO</span>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">Live</span>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca..."
            className="w-20 sm:w-32 px-2 py-0.5 rounded text-[10px] bg-stone-900/50 border border-amber-800/40 text-amber-100 placeholder:text-amber-700/50 focus:border-violet-400/60 focus:outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-[11px]">
          <span className="flex items-center gap-1 text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> {statusCounts.active}
          </span>
          <span className="flex items-center gap-1 text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500" /> {statusCounts.idle}
          </span>
          {statusCounts.paused > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {statusCounts.paused}
            </span>
          )}
          {statusCounts.error > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {statusCounts.error}
            </span>
          )}
          <span className="hidden sm:inline text-muted-foreground">
            {activeAgents.length} agenti
          </span>
          <span className="hidden sm:block"><WallClock size={24} /></span>
          <AmbientSound />
          <button
            type="button"
            onClick={toggleFullscreen}
            className="text-[10px] text-muted-foreground hover:text-white transition-colors px-1 hidden sm:block"
            title={isFullscreen ? "Esci da schermo intero" : "Schermo intero"}
          >
            {isFullscreen ? "⊡" : "⛶"}
          </button>
        </div>
      </div>

      {/* 3D Office Scene — single WebGL canvas, Three.js + R3F */}
      <div
        className="relative flex-1"
        style={{ minHeight: 0, backgroundColor: "#e8cfa0" }}
      >
        <OfficeScene
          agents={filteredAgents}
          onAgentClick={setChatAgent}
          onReady={() => setSceneReady(true)}
        />

        {/* Loading overlay — visible until the Canvas fires onCreated */}
        {!sceneReady && (
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
            style={{
              background:
                "radial-gradient(ellipse at center, #d4b896 0%, #8a6a4a 70%, #2a1f16 100%)",
            }}
          >
            <div className="flex flex-col items-center gap-4">
              {/* Spinner */}
              <div
                className="w-12 h-12 rounded-full border-4"
                style={{
                  borderColor: "rgba(255, 234, 194, 0.2)",
                  borderTopColor: "#ffeac2",
                  animation: "spin 1s linear infinite",
                }}
              />
              <div className="text-amber-100 text-xs tracking-wider uppercase font-semibold">
                Preparazione ufficio 3D
              </div>
              <div className="text-amber-200/60 text-[10px]">
                caricamento texture, lighting e scena…
              </div>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Controls hint — bottom left */}
        {sceneReady && (
          <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-amber-100/60 bg-black/30 backdrop-blur-sm px-2 py-1 rounded">
            🖱️ Trascina per ruotare · rotella per zoom · tasto destro per pan
          </div>
        )}

        {/* Brand label bottom center */}
        <div className="pointer-events-none absolute bottom-2 left-0 right-0 text-center">
          <span className="text-[10px] text-amber-800/40 font-bold tracking-widest">
            PAPERCLIP AI
          </span>
        </div>
      </div>

      <AgentChatSheet
        agent={chatAgent}
        open={chatAgent !== null}
        onOpenChange={(open) => { if (!open) setChatAgent(null); }}
      />
    </div>
  );
}
