/**
 * PixelOffice v7 — HTML/CSS layout with mini Canvas characters.
 *
 * Features: department cards, agent search, day/night cycle, fullscreen,
 * confetti, keyboard navigation, ambient sounds, stagger animations.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { approvalsApi } from "../api/approvals";
import { activityApi } from "../api/activity";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { AgentChatSheet } from "../components/AgentChatSheet";
import { buildDepartmentGroups } from "../lib/departmentGroups";
import { DeskUnit, WallClock } from "../components/office";
import { Confetti } from "../components/office/Confetti";
import { AmbientSound } from "../components/office/AmbientSound";
import { RelaxZone } from "../components/office/RelaxZone";
import { CEOCorner } from "../components/office/CEOCorner";
import { SharedTable } from "../components/office/SharedTable";
import { DocumentFlow } from "../components/office/DocumentFlow";
import { getDeptTheme, flattenDepartment } from "../lib/departmentGroups";
import type { Agent, Approval, ActivityEvent } from "@paperclipai/shared";

/** Infer department type from leader name for icon/label */
function inferDeptMeta(agent: { name: string; role: string }): { icon: string; label: string; role: string } {
  const n = agent.name.toLowerCase();
  if (n.includes("creativ") || n.includes("design") || n.includes("art")) return { icon: "🎨", label: "CREATIVE", role: "designer" };
  if (n.includes("ecommerce") || n.includes("e-commerce")) return { icon: "🛒", label: "ECOMMERCE", role: "ecommerce" };
  if (n.includes("ricerca") || n.includes("research") || n.includes("intelligence")) return { icon: "🔬", label: "RICERCA", role: "researcher" };
  if (n.includes("finanz") || n.includes("finance") || n.includes("cfo")) return { icon: "💰", label: "FINANCE", role: "cfo" };
  if (n.includes("marketing") || n.includes("growth")) return { icon: "📊", label: "MARKETING", role: "cmo" };
  if (n.includes("tech") || agent.role === "cto" || agent.role === "engineer") return { icon: "💻", label: "TECH", role: "engineer" };
  return { icon: "🏢", label: "TEAM", role: agent.role };
}

/* ── Day/night cycle ── */
function useDayNightBg(): string {
  const [bg, setBg] = useState(() => computeBg());
  useEffect(() => {
    const id = setInterval(() => setBg(computeBg()), 60_000);
    return () => clearInterval(id);
  }, []);
  return bg;
}
function computeBg(): string {
  const h = new Date().getHours();
  if (h >= 22 || h < 5) return "#08080f";
  if (h >= 5 && h < 7) return "#0c0a10";
  if (h >= 7 && h < 10) return "#0e0d14";
  if (h >= 10 && h < 17) return "#0e0e16";
  if (h >= 17 && h < 20) return "#100e14";
  return "#0c0a12";
}

export function PixelOffice() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const bgColor = useDayNightBg();

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
  const { data: allApprovals } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!),
    queryFn: () => approvalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const activeAgents = useMemo(
    () => (agents ?? []).filter((a) => a.status !== "terminated"),
    [agents],
  );

  const pendingApprovalsByAgent = useMemo(() => {
    const map = new Map<string, Approval[]>();
    for (const a of allApprovals ?? []) {
      if (a.status !== "pending" && a.status !== "revision_requested") continue;
      const agentId = a.requestedByAgentId;
      if (!agentId) continue;
      if (!map.has(agentId)) map.set(agentId, []);
      map.get(agentId)!.push(a);
    }
    return map;
  }, [allApprovals]);

  const lastCommentByAgent = useMemo(() => {
    const map = new Map<string, ActivityEvent>();
    for (const ev of activity ?? []) {
      if (ev.action !== "issue.comment_added" && ev.action !== "issue.commented") continue;
      const agentId = ev.agentId ?? ev.actorId;
      if (!agentId || ev.actorType !== "agent") continue;
      if (!map.has(agentId)) map.set(agentId, ev);
    }
    return map;
  }, [activity]);

  const deptData = useMemo(() => buildDepartmentGroups(activeAgents), [activeAgents]);

  const approvalQueue = useMemo(() => {
    const queue: Array<{ agent: Agent; text: string; count: number }> = [];
    for (const agent of activeAgents) {
      const pending = pendingApprovalsByAgent.get(agent.id);
      if (pending && pending.length > 0) {
        const text = (pending[0].payload as Record<string, unknown> | null)?.stepTitle as string ??
          pending[0].type.replaceAll("_", " ");
        queue.push({ agent, text, count: pending.length });
      }
    }
    return queue;
  }, [activeAgents, pendingApprovalsByAgent]);

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

  /* ── Break area: paused agents go to the lounge ── */
  const breakAgents = useMemo(
    () => activeAgents.filter((a) => a.status === "paused"),
    [activeAgents],
  );

  /* ── Search ── */
  const searchLower = searchQuery.toLowerCase();
  const filteredDepts = useMemo(() => {
    if (!searchLower) return deptData.departments;
    return deptData.departments.filter((dept) => {
      const all = [dept.leader, ...dept.members];
      for (const sub of dept.subDepartments) all.push(sub.leader, ...sub.members);
      return all.some((a) => a.name.toLowerCase().includes(searchLower) || (a.role ?? "").toLowerCase().includes(searchLower));
    });
  }, [deptData.departments, searchLower]);

  const filteredStandalone = useMemo(() => {
    if (!searchLower) return deptData.standalone;
    return deptData.standalone.filter((a) => a.name.toLowerCase().includes(searchLower) || (a.role ?? "").toLowerCase().includes(searchLower));
  }, [deptData.standalone, searchLower]);

  const showCeo = !searchLower || (deptData.ceo?.name.toLowerCase().includes(searchLower) ?? false);

  /* ── Keyboard nav ── */
  const allVisibleAgents = useMemo(() => {
    const list: Agent[] = [];
    if (showCeo && deptData.ceo) list.push(deptData.ceo);
    for (const dept of filteredDepts) {
      list.push(dept.leader, ...dept.members);
      for (const sub of dept.subDepartments) list.push(sub.leader, ...sub.members);
    }
    list.push(...filteredStandalone);
    return list;
  }, [showCeo, deptData.ceo, filteredDepts, filteredStandalone]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, allVisibleAgents.length - 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && focusedIdx >= 0 && focusedIdx < allVisibleAgents.length) {
      e.preventDefault(); setChatAgent(allVisibleAgents[focusedIdx]);
    } else if (e.key === "Escape") {
      setChatAgent(null); setFocusedIdx(-1); setSearchQuery("");
    }
  }, [allVisibleAgents, focusedIdx]);

  /* ── Confetti on approval resolution ── */
  const prevApprovalCount = useRef(allApprovals?.length ?? 0);
  useEffect(() => {
    const current = allApprovals?.length ?? 0;
    if (prevApprovalCount.current > 0 && current < prevApprovalCount.current) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
    prevApprovalCount.current = current;
  }, [allApprovals?.length]);

  return (
    <div ref={containerRef} className="flex flex-col h-[calc(100vh-48px)] outline-none" style={{ backgroundColor: bgColor }} onKeyDown={handleKeyDown} tabIndex={0}>
      <Confetti active={showConfetti} />

      {/* Header — responsive: wraps on mobile */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-border" style={{ backgroundColor: bgColor }}>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs sm:text-sm font-semibold text-violet-400 tracking-wide">UFFICIO</span>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">Live</span>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setFocusedIdx(-1); }}
            placeholder="Cerca..."
            className="w-20 sm:w-32 px-2 py-0.5 rounded text-[10px] bg-slate-800/60 border border-slate-700/50 text-slate-300 placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none transition-colors"
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
            {deptData.departments.length} reparti · {activeAgents.length} agenti
          </span>
          <span className="hidden sm:block"><WallClock size={24} /></span>
          <AmbientSound />
          <button type="button" onClick={toggleFullscreen} className="text-[10px] text-muted-foreground hover:text-white transition-colors px-1 hidden sm:block" title={isFullscreen ? "Esci da schermo intero" : "Schermo intero"}>
            {isFullscreen ? "⊡" : "⛶"}
          </button>
        </div>
      </div>

      {/* Content — continuous open-space floor */}
      <div className="relative flex-1 overflow-auto p-4" style={{ minHeight: 0, backgroundColor: bgColor, backgroundImage: `linear-gradient(180deg, ${bgColor}00 0%, ${bgColor} 100%), url(/sprites/office/floor-tile.png)`, backgroundSize: "100% 100%, 50px 50px", backgroundBlendMode: "normal, soft-light", backgroundRepeat: "no-repeat, repeat" }}>
        {/* Vignette overlay */}
        <div className="pointer-events-none fixed inset-0 z-50" style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)" }} />
        {/* Document flow particles */}
        <DocumentFlow pendingCount={approvalQueue.length} />

        {/* Open-space layout: one continuous floor */}
        <div className="max-w-[1400px] mx-auto">

          {/* Top row: CEO corner + first departments */}
          <div className="flex flex-wrap items-start justify-center gap-x-8 gap-y-6 py-4">
            {/* CEO in corner, small */}
            {showCeo && deptData.ceo && (
              <CEOCorner
                ceo={deptData.ceo}
                pending={pendingApprovalsByAgent.get(deptData.ceo.id)}
                lastComment={lastCommentByAgent.get(deptData.ceo.id)}
                onClick={() => setChatAgent(deptData.ceo!)}
              />
            )}

            {/* Department shared tables */}
            {filteredDepts.map((dept) => {
              const allAgents = flattenDepartment(dept);
              const members = allAgents.filter((a) => a.id !== dept.leader.id);
              // Split: working/idle at table, some standing
              const seated: typeof members = [];
              const standing: typeof members = [];
              for (const m of members) {
                // Only active idle agents can be standing (not paused, not error)
                const h = m.id.charCodeAt(0) + m.id.charCodeAt(m.id.length - 1);
                const isStandingCandidate = m.status === "idle" && h % 10 < 3; // 30% of idle
                if (isStandingCandidate) standing.push(m);
                else seated.push(m);
              }
              const meta = inferDeptMeta(dept.leader);
              const theme = getDeptTheme(meta.role);
              return (
                <SharedTable
                  key={dept.leader.id}
                  label={meta.label}
                  icon={meta.icon}
                  accent={theme.accent}
                  leader={dept.leader}
                  seated={seated}
                  standing={standing}
                  pendingApprovals={pendingApprovalsByAgent}
                  lastComments={lastCommentByAgent}
                  onAgentClick={setChatAgent}
                />
              );
            })}

            {/* Standalone CEO-direct agents — as loose desks in the space */}
            {filteredStandalone.length > 0 && filteredStandalone.map((agent) => (
              <DeskUnit
                key={agent.id}
                agent={agent}
                pending={pendingApprovalsByAgent.get(agent.id)}
                lastComment={lastCommentByAgent.get(agent.id)}
                onClick={() => setChatAgent(agent)}
              />
            ))}
          </div>

          {searchLower && filteredDepts.length === 0 && filteredStandalone.length === 0 && !showCeo && (
            <div className="text-center py-8 text-slate-500 text-sm">Nessun agente trovato per "{searchQuery}"</div>
          )}

          {/* Relax zone — integrated, not a card */}
          <RelaxZone agents={breakAgents} onAgentClick={setChatAgent} />

          <div className="text-center py-4">
            <span className="text-[10px] text-white/[0.06] font-bold tracking-widest">PAPERCLIP AI</span>
          </div>
        </div>
      </div>

      <AgentChatSheet agent={chatAgent} open={chatAgent !== null} onOpenChange={(open) => { if (!open) setChatAgent(null); }} />
    </div>
  );
}
