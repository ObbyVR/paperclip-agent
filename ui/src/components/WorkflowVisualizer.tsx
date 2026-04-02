import { useMemo, useState } from "react";
import { cn } from "../lib/utils";
import {
  Bot,
  Check,
  ChevronDown,
  Clock,
  Code,
  FileText,
  GitMerge,
  Loader,
  MessageSquare,
  Paintbrush,
  PenTool,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";

/* ── Types ──────────────────────────────────── */

export type StepStatus = "pending" | "active" | "waiting" | "done" | "error";

export interface SubProcess {
  label: string;
  status: "pending" | "running" | "done" | "error";
}

export interface WorkflowStep {
  id: string;
  label: string;
  icon: typeof Search;
  status: StepStatus;
  statusLabel?: string;
  subProcesses?: SubProcess[];
  waitingFor?: string;
}

export interface WorkflowLane {
  agentName: string;
  agentLink?: string;
  steps: WorkflowStep[];
}

export interface WorkflowEvent {
  id: string;
  ts: string;
  type: "output" | "approval" | "error" | "info" | "merge";
  stepLabel?: string;
  agentName?: string;
  message: string;
  outputLink?: string;
}

/* ── Hex background ─────────────────────────── */

function HexPattern() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="hex" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(0.5)">
          <path d="M28 66L0 50L0 16L28 0L56 16L56 50L28 66ZM28 100L0 84L0 50L28 34L56 50L56 84L28 100Z" fill="none" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex)" />
    </svg>
  );
}

/* ── Sub-process mini node (vertical) ───────── */

function SubProcessDot({ proc }: { proc: SubProcess }) {
  return (
    <div className="flex items-center gap-1">
      <span className={cn(
        "flex h-2 w-2 shrink-0 rounded-full border",
        proc.status === "running" && "border-cyan-400 bg-cyan-400/40 animate-pulse",
        proc.status === "done" && "border-emerald-400 bg-emerald-400/40",
        proc.status === "error" && "border-red-400 bg-red-400/40",
        proc.status === "pending" && "border-muted-foreground/30 bg-transparent",
      )} />
      <span className={cn(
        "text-[8px] leading-none whitespace-nowrap",
        proc.status === "running" && "text-cyan-300/80",
        proc.status === "done" && "text-emerald-300/60",
        proc.status === "error" && "text-red-300/60",
        proc.status === "pending" && "text-muted-foreground/30",
      )}>
        {proc.label}
      </span>
    </div>
  );
}

/* ── Step node ──────────────────────────────── */

function StepNode({ step, index }: { step: WorkflowStep; index: number }) {
  const Icon = step.icon;
  const { status } = step;
  const isPending = status === "pending";
  const hasSubs = step.subProcesses && step.subProcesses.length > 0 && !isPending;

  return (
    <div className="flex flex-col items-center gap-1 min-w-[72px]">
      {/* Step number */}
      <div className="flex items-center gap-1 h-3.5">
        {!isPending && <span className="text-[9px] text-muted-foreground/50">{index + 1}</span>}
        {status === "waiting" && step.statusLabel && (
          <span className="flex items-center gap-0.5 text-[8px] text-amber-400/70">
            <Clock className="h-2 w-2" />
            {step.statusLabel}
          </span>
        )}
      </div>

      {/* Circle */}
      <div className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-500",
        status === "done" && "border-emerald-500/60 bg-emerald-500/[0.08]",
        status === "active" && "border-cyan-400/60 bg-cyan-400/[0.08] shadow-[0_0_16px_rgba(6,182,212,0.15)]",
        status === "waiting" && "border-amber-400/50 bg-amber-400/[0.06]",
        status === "error" && "border-red-500/60 bg-red-500/[0.08]",
        isPending && "border-muted-foreground/20 bg-muted-foreground/[0.04]",
      )}>
        {status === "active" && <span className="absolute inset-0 animate-ping rounded-full border-2 border-cyan-400/20" />}
        <Icon className={cn(
          "h-4 w-4",
          status === "done" && "text-emerald-400",
          status === "active" && "text-cyan-300",
          status === "waiting" && "text-amber-400",
          status === "error" && "text-red-400",
          isPending && "text-muted-foreground/40",
        )} />
      </div>

      {/* Label */}
      <span className={cn(
        "text-[9px] font-medium text-center leading-tight max-w-[72px]",
        status === "done" && "text-emerald-300/70",
        status === "active" && "text-cyan-200/80",
        status === "waiting" && "text-amber-300/70",
        status === "error" && "text-red-300/70",
        isPending && "text-muted-foreground/30",
      )}>
        {step.label}
      </span>

      {/* Vertical sub-processes */}
      {hasSubs && (
        <div className="flex flex-col gap-0.5 mt-0.5 items-start pl-1">
          {step.subProcesses!.map((proc, pi) => (
            <SubProcessDot key={pi} proc={proc} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Connector with travelling dot ──────────── */

function Connector({ done, active }: { done: boolean; active?: boolean }) {
  return (
    <div className="relative flex items-center self-start mt-[30px]">
      <div className={cn(
        "h-px w-10 sm:w-14 border-t-2 border-dashed transition-colors duration-500",
        done ? "border-emerald-500/40" : "border-muted-foreground/15",
      )} />
      <div className={cn(
        "h-0 w-0 border-y-[3px] border-l-[5px] border-y-transparent transition-colors duration-500",
        done ? "border-l-emerald-500/40" : "border-l-muted-foreground/15",
      )} />
      {/* Travelling dot on the dashed line */}
      {active && (
        <span className="absolute top-1/2 -translate-y-1/2 left-0 h-[5px] w-[5px] rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)] animate-[wf-travel_1.4s_ease-in-out_infinite]" />
      )}
    </div>
  );
}

/* ── Agent badge ────────────────────────────── */

function AgentBadge({ name, link }: { name: string; link?: string }) {
  const inner = (
    <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-600/50 bg-amber-600/10">
      <Bot className="h-4 w-4 text-amber-500" />
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-1 min-w-[60px]">
      <div className="h-3.5" />
      {link ? <a href={link} className="hover:scale-105 transition-transform">{inner}</a> : inner}
      <span className="text-[9px] font-medium text-amber-400/70 text-center max-w-[60px] truncate">{name}</span>
    </div>
  );
}

/* ── Lane row ───────────────────────────────── */

function LaneRow({ lane, laneIndex }: { lane: WorkflowLane; laneIndex: number }) {
  const started = lane.steps.some((s) => s.status !== "pending");
  const activeIdx = lane.steps.findIndex((s) => s.status === "active");

  return (
    <div className="flex items-start gap-0 py-2" data-lane={laneIndex}>
      <AgentBadge name={lane.agentName} link={lane.agentLink} />
      <Connector done={started} active={activeIdx === 0} />
      {lane.steps.map((step, si) => {
        const nextIsActive = si < lane.steps.length - 1 && lane.steps[si + 1].status === "active";
        return (
          <div key={step.id} className="flex items-start">
            <StepNode step={step} index={si} />
            {si < lane.steps.length - 1 && (
              <Connector done={step.status === "done"} active={nextIsActive && step.status === "done"} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Cross-lane dependency lines ────────────── */

function CrossLaneLinks({ lanes }: { lanes: WorkflowLane[] }) {
  // Find steps that have waitingFor pointing to another lane's step
  const links: Array<{ fromLane: number; fromStep: number; toLane: number; toStep: number }> = [];

  lanes.forEach((lane, li) => {
    lane.steps.forEach((step, si) => {
      if (!step.waitingFor) return;
      // Find the step in other lanes
      lanes.forEach((otherLane, oli) => {
        if (oli === li) return;
        const targetIdx = otherLane.steps.findIndex((s) => s.id === step.waitingFor);
        if (targetIdx >= 0) {
          links.push({ fromLane: oli, fromStep: targetIdx, toLane: li, toStep: si });
        }
      });
    });
  });

  if (links.length === 0) return null;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
      <defs>
        <marker id="wf-cross-arrow" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
          <path d="M0,0 L6,2.5 L0,5" fill="none" stroke="rgb(139,92,246)" strokeWidth="1" opacity="0.5" />
        </marker>
      </defs>
      {links.map((link, i) => {
        // Approximate positions based on grid layout
        // Each agent badge ~60px + each step ~72px + connectors ~56px
        const stepX = (colIdx: number) => 60 + 56 + colIdx * (72 + 56) + 36; // center of step circle
        const laneY = (laneIdx: number) => 8 + laneIdx * 90 + 45; // center of lane

        const x1 = stepX(link.fromStep);
        const y1 = laneY(link.fromLane);
        const x2 = stepX(link.toStep);
        const y2 = laneY(link.toLane);

        return (
          <line
            key={i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="rgb(139,92,246)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.35"
            markerEnd="url(#wf-cross-arrow)"
          />
        );
      })}
    </svg>
  );
}

/* ── Event row ──────────────────────────────── */

const EVENT_ICONS: Record<WorkflowEvent["type"], typeof MessageSquare> = {
  output: FileText,
  approval: ShieldCheck,
  error: Wrench,
  info: MessageSquare,
  merge: GitMerge,
};

function EventRow({ event }: { event: WorkflowEvent }) {
  const Icon = EVENT_ICONS[event.type];
  return (
    <div className={cn(
      "flex items-start gap-2.5 px-3 py-2 text-xs border-b border-border/40 last:border-b-0",
      event.type === "approval" && "bg-amber-500/[0.03]",
      event.type === "error" && "bg-red-500/[0.03]",
      event.type === "merge" && "bg-violet-500/[0.03]",
    )}>
      <Icon className={cn(
        "h-3.5 w-3.5 mt-0.5 shrink-0",
        event.type === "output" && "text-emerald-400",
        event.type === "approval" && "text-amber-400",
        event.type === "error" && "text-red-400",
        event.type === "info" && "text-muted-foreground",
        event.type === "merge" && "text-violet-400",
      )} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {event.agentName && <span className="font-medium text-foreground">{event.agentName}</span>}
          {event.stepLabel && <span className="text-muted-foreground">· {event.stepLabel}</span>}
          <span className="text-muted-foreground/50 ml-auto shrink-0">{event.ts}</span>
        </div>
        <p className="text-muted-foreground mt-0.5">{event.message}</p>
        {event.outputLink && (
          <a href={event.outputLink} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline mt-0.5 inline-block">
            Vedi output →
          </a>
        )}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────── */

export interface WorkflowStats {
  totalSteps: number;
  completedSteps: number;
  activeSteps: number;
  agents: number;
  elapsedTime?: string;
  estimatedCostEur?: string;
  estimatedCostUsd?: string;
}

interface WorkflowVisualizerProps {
  lanes: WorkflowLane[];
  merges?: Array<{ fromAgent: string; toAgent: string; label?: string; afterLane: number }>;
  events?: WorkflowEvent[];
  stats?: WorkflowStats;
  className?: string;
}

export function WorkflowVisualizer({ lanes, merges, events, stats, className }: WorkflowVisualizerProps) {
  return (
    <div className={cn("space-y-0", className)}>
      <div className="relative overflow-hidden rounded-xl border border-border bg-[#0c0e14] px-4 sm:px-6 py-2">
        <HexPattern />

        {/* Workflow stats bar */}
        {stats && (
          <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1 px-1 py-1.5 mb-1 text-[10px] text-muted-foreground/60 border-b border-border/20">
            <span>
              <span className="font-semibold text-foreground/80">{stats.completedSteps}</span>/{stats.totalSteps} step
            </span>
            {stats.activeSteps > 0 && (
              <span className="text-cyan-400/70">
                {stats.activeSteps} in corso
              </span>
            )}
            <span>
              <span className="font-semibold text-foreground/80">{stats.agents}</span> agenti
            </span>
            {stats.elapsedTime && (
              <span>
                <Clock className="inline h-2.5 w-2.5 mr-0.5 -mt-px" />
                {stats.elapsedTime}
              </span>
            )}
            {(stats.estimatedCostEur || stats.estimatedCostUsd) && (
              <span className="ml-auto">
                {stats.estimatedCostEur && <span className="font-semibold text-foreground/80">{stats.estimatedCostEur}</span>}
                {stats.estimatedCostUsd && <span className="text-muted-foreground/40 ml-1">({stats.estimatedCostUsd})</span>}
              </span>
            )}
          </div>
        )}
        <div className="relative overflow-x-auto">
          <CrossLaneLinks lanes={lanes} />
          {lanes.map((lane, li) => (
            <div key={li}>
              <LaneRow lane={lane} laneIndex={li} />
              {/* Merge badge between lanes */}
              {(merges ?? []).filter((m) => m.afterLane === li).map((m, mi) => (
                <div key={mi} className="flex items-center gap-2 py-0.5 px-4">
                  <div className="flex-1 border-t border-dashed border-violet-500/25" />
                  <div className="flex items-center gap-1 rounded-full border border-violet-500/20 bg-violet-500/[0.05] px-2 py-0.5">
                    <GitMerge className="h-2.5 w-2.5 text-violet-400/70" />
                    <span className="text-[9px] text-violet-300/70">{m.label ?? `${m.fromAgent} → ${m.toAgent}`}</span>
                  </div>
                  <div className="flex-1 border-t border-dashed border-violet-500/25" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Events panel */}
      {events && events.length > 0 && (
        <div className="rounded-b-xl border border-t-0 border-border bg-card/30 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border/40">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Eventi workflow</span>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {events.map((ev) => <EventRow key={ev.id} event={ev} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Preset templates ───────────────────────── */

export function getWorkflowSteps(workflowType?: string): WorkflowStep[] {
  const templates: Record<string, WorkflowStep[]> = {
    "website_redesign": [
      { id: "brand", label: "Brand Analysis", icon: Search, status: "pending" },
      { id: "scene", label: "Scene Generation", icon: Sparkles, status: "pending" },
      { id: "build", label: "Website Build", icon: Code, status: "pending" },
      { id: "deploy", label: "Deploy", icon: Zap, status: "pending" },
    ],
    "copywriting": [
      { id: "research", label: "Research", icon: Search, status: "pending" },
      { id: "write", label: "Write Copy", icon: PenTool, status: "pending" },
      { id: "review", label: "Review", icon: Check, status: "pending" },
    ],
  };
  return templates[workflowType ?? "default"] ?? templates["website_redesign"];
}
