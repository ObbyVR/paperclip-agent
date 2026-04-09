/**
 * PixelOffice v6 — Panoramic department view.
 *
 * Single scrollable canvas showing CEO office at top and department
 * rooms below. Agents grouped by reportsTo hierarchy. No tabs.
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
import { buildDepartmentGroups, flattenDepartment, getDeptTheme, type DepartmentGroup } from "../lib/departmentGroups";
import type { Agent, Approval, ActivityEvent } from "@paperclipai/shared";

/* ═══════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════ */

const CANVAS_W = 1600;
const BG_COLOR = "#0e0e16";

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e", running: "#06b6d4", idle: "#6b7280",
  paused: "#f59e0b", error: "#ef4444", terminated: "#374151",
};

const SKIN_TONES = ["#f0c8a0", "#e0b090", "#d09868", "#b07848", "#905830"];
const HAIR_COLORS = ["#1a1a2e", "#3d2b1f", "#8b4513", "#c5a880", "#b83a14", "#daa520", "#2d1b0e", "#4a2c2a"];
const SHIRT_COLORS = [
  "#4a6fa5", "#6b5b95", "#88b04b", "#ff6f61", "#45b8ac",
  "#d4507a", "#5a7d9a", "#b5838d", "#e6a157", "#7c6f9a",
  "#3a8a6e", "#c06040",
];
const PANT_COLORS = ["#2a2a3e", "#1a2a4a", "#3a2a2a", "#2a3a2a", "#333340"];
const DESK_ITEMS = ["lamp", "mug", "eightBall", "stapler", "penHolder", "thermos", "duck"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ═══════════════════════════════════════════════════════════════
   Sprite loader
   ═══════════════════════════════════════════════════════════════ */

const SPRITE_URLS: Record<string, string> = {
  desk: "/sprites/office/desk.png",
  chair: "/sprites/office/chair.png",
  monitor: "/sprites/office/monitor_back.png",
  keyboard: "/sprites/office/keyboard_back.png",
  mug: "/sprites/office/coffee-mug.png",
  plant: "/sprites/office/plant.png",
  watercooler: "/sprites/office/watercooler.png",
  coffeeMachine: "/sprites/office/coffee-machine.png",
  floorTile: "/sprites/office/floor-tile.png",
  lamp: "/sprites/office/desk-lamp.png",
  penHolder: "/sprites/office/pen-holder.png",
  eightBall: "/sprites/office/magic-8-ball.png",
  duck: "/sprites/office/rubber-duck.png",
  stapler: "/sprites/office/stapler.png",
  thermos: "/sprites/office/thermos.png",
  printer: "/sprites/office/old-printer.png",
  phone: "/sprites/office/phone.png",
};

type Textures = Record<string, HTMLImageElement>;

function useTextures(): Textures | null {
  const [textures, setTextures] = useState<Textures | null>(null);
  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(SPRITE_URLS);
    Promise.all(
      entries.map(
        ([, url]) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
          }),
      ),
    ).then((images) => {
      if (cancelled) return;
      const map: Textures = {};
      entries.forEach(([key], i) => { map[key] = images[i]; });
      setTextures(map);
    });
    return () => { cancelled = true; };
  }, []);
  return textures;
}

/* ═══════════════════════════════════════════════════════════════
   Drawing helpers
   ═══════════════════════════════════════════════════════════════ */

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number,
  w: number, h: number,
  _opts?: { alpha?: number },
) {
  ctx.save();
  if (_opts?.alpha !== undefined) ctx.globalAlpha = _opts.alpha;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ═══════════════════════════════════════════════════════════════
   Character drawing
   ═══════════════════════════════════════════════════════════════ */

function drawAgent(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  status: string, time: number, agentHash: number, isSelected: boolean,
) {
  const isWorking = status === "active" || status === "running";
  const isError = status === "error";
  const isPaused = status === "paused";
  const skin = SKIN_TONES[agentHash % SKIN_TONES.length];
  const hair = HAIR_COLORS[(agentHash >> 4) % HAIR_COLORS.length];
  const shirt = SHIRT_COLORS[(agentHash >> 8) % SHIRT_COLORS.length];
  const pants = PANT_COLORS[(agentHash >> 12) % PANT_COLORS.length];
  const dotColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;

  const breathY = Math.sin(time * 2.5 + agentHash) * 1;
  const armBob = isWorking ? Math.sin(time * 8 + agentHash) * 2.5 : 0;
  const headTilt = isPaused ? Math.sin(time * 0.8 + agentHash) * 2 : 0;

  const seatY = y;
  const torsoY = seatY - 18 + breathY;
  const headY = torsoY - 16;

  ctx.save();

  if (isSelected) {
    ctx.strokeStyle = "#a78bfa"; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.ellipse(x, seatY + 4, 24, 8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Legs
  ctx.fillStyle = pants;
  roundRect(ctx, x - 9, seatY - 2, 7, 12, 2); ctx.fill();
  roundRect(ctx, x + 2, seatY - 2, 7, 12, 2); ctx.fill();
  ctx.fillStyle = "#1a1a26";
  roundRect(ctx, x - 10, seatY + 9, 8, 4, 1); ctx.fill();
  roundRect(ctx, x + 2, seatY + 9, 8, 4, 1); ctx.fill();

  // Torso
  ctx.fillStyle = shirt;
  roundRect(ctx, x - 12, torsoY, 24, 18, 3); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.moveTo(x - 4, torsoY); ctx.lineTo(x, torsoY + 4); ctx.lineTo(x + 4, torsoY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fillRect(x - 10, torsoY + 1, 8, 16);

  // Arms
  ctx.fillStyle = shirt;
  roundRect(ctx, x - 17, torsoY + 2 + armBob, 6, 14, 2); ctx.fill();
  roundRect(ctx, x + 11, torsoY + 2 - armBob, 6, 14, 2); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x - 14, torsoY + 17 + armBob, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 14, torsoY + 17 - armBob, 3, 0, Math.PI * 2); ctx.fill();

  // Head
  ctx.save();
  if (headTilt) { ctx.translate(x, headY + 8); ctx.rotate(headTilt * Math.PI / 180); ctx.translate(-x, -(headY + 8)); }
  ctx.fillStyle = skin; ctx.fillRect(x - 3, torsoY - 2, 6, 4);
  ctx.fillStyle = skin; roundRect(ctx, x - 10, headY - 4, 20, 18, 6); ctx.fill();

  // Hair
  const hairStyle = agentHash % 4;
  ctx.fillStyle = hair;
  if (hairStyle === 0) { roundRect(ctx, x - 11, headY - 7, 22, 10, 5); ctx.fill(); ctx.fillRect(x - 11, headY - 2, 3, 8); ctx.fillRect(x + 8, headY - 2, 3, 8); }
  else if (hairStyle === 1) { roundRect(ctx, x - 11, headY - 8, 22, 12, 6); ctx.fill(); roundRect(ctx, x - 12, headY - 4, 4, 10, 2); ctx.fill(); roundRect(ctx, x + 8, headY - 4, 4, 10, 2); ctx.fill(); }
  else if (hairStyle === 2) { roundRect(ctx, x - 12, headY - 8, 24, 11, 6); ctx.fill(); roundRect(ctx, x - 13, headY - 2, 5, 14, 2); ctx.fill(); roundRect(ctx, x + 8, headY - 2, 5, 14, 2); ctx.fill(); }
  else { roundRect(ctx, x - 11, headY - 9, 22, 11, 4); ctx.fill(); ctx.fillRect(x - 8, headY - 11, 3, 5); ctx.fillRect(x - 2, headY - 12, 3, 5); ctx.fillRect(x + 4, headY - 11, 3, 5); }

  // Eyes
  const eyeY = headY + 5;
  ctx.fillStyle = "#fff"; roundRect(ctx, x - 7, eyeY, 5, 4, 2); ctx.fill(); roundRect(ctx, x + 2, eyeY, 5, 4, 2); ctx.fill();
  ctx.fillStyle = "#1a1a2e";
  const px = isWorking ? 1 : 0; const py = isWorking ? 1 : 0;
  ctx.fillRect(x - 5 + px, eyeY + 1 + py, 2, 2); ctx.fillRect(x + 4 + px, eyeY + 1 + py, 2, 2);
  ctx.fillStyle = hair; ctx.fillRect(x - 7, eyeY - 2, 5, 1); ctx.fillRect(x + 2, eyeY - 2, 5, 1);
  if (isError) { ctx.fillRect(x - 8, eyeY - 3, 3, 1); ctx.fillRect(x + 5, eyeY - 3, 3, 1); }

  // Mouth
  if (isWorking) { ctx.fillStyle = "#c07060"; roundRect(ctx, x - 2, headY + 11, 4, 2, 1); ctx.fill(); }
  else if (isError) { ctx.strokeStyle = "#a06050"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, headY + 14, 3, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke(); }
  else if (isPaused) { ctx.fillStyle = "#a06050"; ctx.fillRect(x - 2, headY + 11, 4, 1); }
  else { ctx.strokeStyle = "#a06050"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, headY + 10, 3, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke(); }

  ctx.restore(); // head tilt

  // Status dot
  ctx.fillStyle = dotColor; ctx.strokeStyle = "#0a0a10"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + 12, headY - 4, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Typing dots
  if (isWorking) {
    const dotPhase = time * 5 + agentHash;
    for (let d = 0; d < 3; d++) {
      const a = 0.3 + 0.7 * Math.max(0, Math.sin(dotPhase + d * 1.2));
      ctx.fillStyle = `rgba(34,197,94,${a})`;
      ctx.beginPath(); ctx.arc(x - 6 + d * 6, seatY + 18, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ZZZ for paused
  if (isPaused) {
    ctx.font = "bold 8px sans-serif"; ctx.fillStyle = "rgba(245,158,11,0.6)";
    const zP = time * 0.5;
    ctx.fillText("z", x + 14, headY - 6 + Math.sin(zP) * 2);
    ctx.fillText("Z", x + 18, headY - 14 + Math.sin(zP + 1) * 2);
    ctx.fillText("Z", x + 22, headY - 22 + Math.sin(zP + 2) * 2);
  }

  ctx.restore();
}

function drawNameTag(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, status: string) {
  const label = name.split("—")[0]?.trim().split(" ")[0] ?? "";
  const dotColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  ctx.font = "bold 10px -apple-system, sans-serif";
  const nameW = ctx.measureText(label).width;
  const padX = 6; const h = 18; const w = nameW + padX * 2 + 12;
  ctx.fillStyle = "rgba(15,23,42,0.90)"; roundRect(ctx, x - w / 2, y, w, h, 4); ctx.fill();
  ctx.strokeStyle = dotColor; ctx.lineWidth = 1; roundRect(ctx, x - w / 2, y, w, h, 4); ctx.stroke();
  ctx.fillStyle = dotColor; ctx.beginPath(); ctx.arc(x - w / 2 + 8, y + h / 2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e2e8f0"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(label, x - w / 2 + 16, y + h / 2);
}

function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, urgent: boolean) {
  ctx.font = "9px -apple-system, sans-serif";
  const clean = text.replace(/^#+\s*/gm, "").replace(/\n/g, " ").trim();
  const display = ctx.measureText(clean).width > 120 ? clean.slice(0, 28) + "…" : clean;
  const textW = ctx.measureText(display).width;
  const w = textW + 12; const h = 16; const bx = x - w / 2; const by = y - h - 6;
  ctx.fillStyle = urgent ? "rgba(127,29,29,0.92)" : "rgba(30,27,50,0.92)";
  ctx.strokeStyle = urgent ? "rgba(239,68,68,0.6)" : "rgba(139,92,246,0.5)";
  ctx.lineWidth = 1; roundRect(ctx, bx, by, w, h, 5); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 4, by + h); ctx.lineTo(x, by + h + 4); ctx.lineTo(x + 4, by + h); ctx.closePath();
  ctx.fillStyle = urgent ? "rgba(127,29,29,0.92)" : "rgba(30,27,50,0.92)"; ctx.fill();
  ctx.fillStyle = urgent ? "#fca5a5" : "#c4b5fd"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(display, x, by + h / 2);
}

function drawWallClock(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  ctx.fillStyle = "#111"; ctx.strokeStyle = "#555"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#1a1a2a"; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.fillStyle = "#555"; ctx.fillRect(x + Math.cos(angle) * 10 - 1, y + Math.sin(angle) * 10 - 1, 2, 2);
  }
  const hourAngle = (time / 120) * Math.PI * 2 - Math.PI / 2;
  const minAngle = (time / 10) * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = "#999"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(hourAngle) * 7, y + Math.sin(hourAngle) * 7); ctx.stroke();
  ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(minAngle) * 10, y + Math.sin(minAngle) * 10); ctx.stroke();
  ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ═══════════════════════════════════════════════════════════════
   Desk at position — draws chair, agent, desk, monitor, accessory
   ═══════════════════════════════════════════════════════════════ */

function drawDeskUnit(
  ctx: CanvasRenderingContext2D,
  tex: Textures,
  agent: Agent,
  x: number, y: number,
  time: number,
  isSelected: boolean,
  isHovered: boolean,
  accessoryKey: string,
  bubble?: { text: string; urgent: boolean },
) {
  const agentHash = hash(agent.id);

  if (isHovered && !isSelected) {
    ctx.save(); ctx.fillStyle = "rgba(167,139,250,0.06)";
    roundRect(ctx, x - 70, y - 20, 140, 130, 8); ctx.fill(); ctx.restore();
  }

  // Chair
  if (tex.chair) drawSprite(ctx, tex.chair, x - 18, y - 6, 36, 58);
  // Agent (behind desk)
  drawAgent(ctx, x, y + 14, agent.status, time, agentHash, isSelected || isHovered);
  // Desk (covers legs)
  if (tex.desk) drawSprite(ctx, tex.desk, x - 65, y + 26, 130, 72);
  // Monitor (on desk)
  if (tex.monitor) drawSprite(ctx, tex.monitor, x - 20, y + 4, 40, 34);
  // Keyboard
  if (tex.keyboard) drawSprite(ctx, tex.keyboard, x - 20, y + 38, 40, 11);
  // Accessory
  const accTex = tex[accessoryKey];
  if (accTex) drawSprite(ctx, accTex, x + 34, y + 32, 18, 18);
  // Name tag
  drawNameTag(ctx, x, y + 100, agent.name, agent.status);
  // Bubble
  if (bubble) drawBubble(ctx, x, y - 50, bubble.text, bubble.urgent);
}

/* ═══════════════════════════════════════════════════════════════
   Department room drawing
   ═══════════════════════════════════════════════════════════════ */

interface RoomLayout {
  x: number; y: number; w: number; h: number;
  agents: Array<{ agent: Agent; ax: number; ay: number }>;
  label: string;
  accent: string;
}

function drawDeptRoom(
  ctx: CanvasRenderingContext2D,
  tex: Textures,
  layout: RoomLayout,
  time: number,
  selectedId: string | null,
  hoverId: string | null,
  pendingApprovals: Map<string, Approval[]>,
  lastComments: Map<string, ActivityEvent>,
) {
  const { x, y, w, h, label, accent } = layout;

  // Compute room status from agents
  const hasError = layout.agents.some(({ agent }) => agent.status === "error");
  const hasActive = layout.agents.some(({ agent }) => agent.status === "active" || agent.status === "running");
  const pulse = Math.sin(time * 3) * 0.5 + 0.5; // 0..1

  // Room background
  ctx.fillStyle = accent + "08";
  roundRect(ctx, x, y, w, h, 8); ctx.fill();

  // Status glow overlay
  if (hasError) {
    ctx.fillStyle = `rgba(239,68,68,${0.03 + pulse * 0.04})`;
    roundRect(ctx, x, y, w, h, 8); ctx.fill();
  } else if (hasActive) {
    ctx.fillStyle = `rgba(34,197,94,${0.02 + pulse * 0.03})`;
    roundRect(ctx, x, y, w, h, 8); ctx.fill();
  }

  // Room border (color based on status)
  const borderColor = hasError ? `rgba(239,68,68,${0.3 + pulse * 0.2})` : hasActive ? `rgba(34,197,94,${0.3 + pulse * 0.15})` : accent + "40";
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = hasError || hasActive ? 2 : 1.5;
  roundRect(ctx, x, y, w, h, 8); ctx.stroke();

  // Room header bar
  ctx.fillStyle = accent + "20";
  roundRect(ctx, x, y, w, 28, 8); ctx.fill();
  // Clip bottom corners of header
  ctx.fillStyle = accent + "20";
  ctx.fillRect(x, y + 20, w, 8);

  // Label
  ctx.font = "bold 11px -apple-system, sans-serif";
  ctx.fillStyle = accent;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(label, x + 12, y + 14);

  // Status indicator + agent count
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  if (hasError) {
    ctx.fillStyle = "#ef4444";
    ctx.fillText("● " + layout.agents.length, x + w - 12, y + 14);
  } else if (hasActive) {
    ctx.fillStyle = "#22c55e";
    ctx.fillText("● " + layout.agents.length, x + w - 12, y + 14);
  } else {
    ctx.fillStyle = accent + "80";
    ctx.fillText(`${layout.agents.length}`, x + w - 12, y + 14);
  }

  // Draw agents at desks
  for (const { agent, ax, ay } of layout.agents) {
    const isSelected2 = selectedId === agent.id;
    const isHovered2 = hoverId === agent.id;
    const pending = pendingApprovals.get(agent.id);
    const comment = lastComments.get(agent.id);
    const hasPending = pending && pending.length > 0;

    let bubble: { text: string; urgent: boolean } | undefined;
    if (hasPending) {
      const text = (pending[0].payload as Record<string, unknown> | null)?.stepTitle as string ??
        pending[0].type.replaceAll("_", " ");
      bubble = { text, urgent: true };
    } else if (comment) {
      const text = (comment.details as Record<string, unknown> | null)?.bodySnippet as string;
      if (text) bubble = { text: text.length > 50 ? text.slice(0, 47) + "…" : text, urgent: false };
    }

    const accessoryKey = DESK_ITEMS[hash(agent.id) % DESK_ITEMS.length];
    drawDeskUnit(ctx, tex, agent, ax, ay, time, isSelected2, isHovered2, accessoryKey, bubble);
  }
}

/* ═══════════════════════════════════════════════════════════════
   CEO Office drawing
   ═══════════════════════════════════════════════════════════════ */

function drawCEOOffice(
  ctx: CanvasRenderingContext2D,
  tex: Textures,
  ceoAgent: Agent,
  queueAgents: Array<{ agent: Agent; text: string; count: number }>,
  x: number, y: number, w: number,
  time: number,
  selectedId: string | null,
  hoverId: string | null,
) {
  const h = queueAgents.length > 0 ? 320 : 200;

  // Room background
  ctx.fillStyle = "rgba(100,70,200,0.04)";
  roundRect(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = "rgba(167,139,250,0.3)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 8); ctx.stroke();

  // Header
  ctx.fillStyle = "rgba(167,139,250,0.12)";
  roundRect(ctx, x, y, w, 28, 8); ctx.fill();
  ctx.fillRect(x, y + 20, w, 8);
  ctx.font = "bold 12px -apple-system, sans-serif";
  ctx.fillStyle = "#a78bfa";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("★ UFFICIO DEL CEO", x + w / 2, y + 14);

  // CEO desk (centered)
  const ceoX = x + w / 2;
  const ceoY = y + 50;
  const ceoHash = hash(ceoAgent.id);
  const isSelected = selectedId === ceoAgent.id;
  const isHovered = hoverId === ceoAgent.id;

  // Chair
  if (tex.chair) drawSprite(ctx, tex.chair, ceoX - 22, ceoY - 10, 44, 66);
  // Agent
  drawAgent(ctx, ceoX, ceoY + 16, ceoAgent.status, time, ceoHash, isSelected || isHovered);
  // Desk (extra wide)
  if (tex.desk) drawSprite(ctx, tex.desk, ceoX - 85, ceoY + 26, 170, 82);
  // Triple monitors
  if (tex.monitor) {
    drawSprite(ctx, tex.monitor, ceoX - 44, ceoY + 2, 34, 28);
    drawSprite(ctx, tex.monitor, ceoX - 14, ceoY - 1, 28, 30);
    drawSprite(ctx, tex.monitor, ceoX + 10, ceoY + 2, 34, 28);
  }
  if (tex.keyboard) drawSprite(ctx, tex.keyboard, ceoX - 20, ceoY + 40, 40, 11);
  if (tex.phone) drawSprite(ctx, tex.phone, ceoX - 65, ceoY + 34, 20, 20);
  if (tex.mug) drawSprite(ctx, tex.mug, ceoX + 48, ceoY + 34, 16, 16);

  // CEO nameplate
  ctx.font = "bold 9px -apple-system, sans-serif";
  const npW = 70;
  ctx.fillStyle = "rgba(201,169,76,0.15)";
  roundRect(ctx, ceoX - npW / 2, ceoY + 108, npW, 14, 3); ctx.fill();
  ctx.strokeStyle = "rgba(201,169,76,0.5)"; ctx.lineWidth = 1;
  roundRect(ctx, ceoX - npW / 2, ceoY + 108, npW, 14, 3); ctx.stroke();
  ctx.fillStyle = "#c9a94c"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("★ CEO — " + (ceoAgent.name.split("—")[0]?.trim().split(" ")[0] ?? ""), ceoX, ceoY + 115);

  // Awards on wall sides
  for (const wx of [x + 20, x + 60, x + w - 80, x + w - 40]) {
    ctx.fillStyle = "rgba(201,169,76,0.08)";
    roundRect(ctx, wx, y + 35, 24, 30, 2); ctx.fill();
    ctx.strokeStyle = "rgba(201,169,76,0.3)"; ctx.lineWidth = 1;
    roundRect(ctx, wx, y + 35, 24, 30, 2); ctx.stroke();
  }

  // Plants
  if (tex.plant) {
    drawSprite(ctx, tex.plant, x + 8, y + 55, 36, 48);
    drawSprite(ctx, tex.plant, x + w - 48, y + 58, 36, 48);
  }

  // Approval queue
  if (queueAgents.length > 0) {
    const queueY = ceoY + 140;
    // Divider
    ctx.strokeStyle = "rgba(167,139,250,0.15)"; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(x + 30, queueY - 10); ctx.lineTo(x + w - 30, queueY - 10); ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "bold 9px -apple-system, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.textAlign = "center"; ctx.fillText("IN ATTESA DI APPROVAZIONE", x + w / 2, queueY - 18);

    const spacing = Math.min(80, (w - 60) / Math.max(queueAgents.length, 1));
    const startX = x + w / 2 - ((queueAgents.length - 1) * spacing) / 2;

    for (let i = 0; i < queueAgents.length; i++) {
      const qa = queueAgents[i];
      const ax = startX + i * spacing;
      const ay = queueY + 20;
      const agentHash = hash(qa.agent.id);
      const waitBob = Math.sin(time * 1.2 + agentHash) * 2;
      const isSel = selectedId === qa.agent.id;
      const isHov = hoverId === qa.agent.id;

      drawAgent(ctx, ax + waitBob, ay, qa.agent.status, time, agentHash, isSel || isHov);
      drawNameTag(ctx, ax, ay + 28, qa.agent.name, qa.agent.status);

      const label = qa.count > 1 ? `${qa.text} (+${qa.count - 1})` : qa.text;
      drawBubble(ctx, ax, ay - 50, label, true);
    }
  }

  return h;
}

/* ═══════════════════════════════════════════════════════════════
   Layout calculator — positions departments on the canvas
   ═══════════════════════════════════════════════════════════════ */

const DEPT_COL_W = 340;
const DEPT_PAD = 20;
const DESK_SPACING_X = 150;
const DESK_SPACING_Y = 140;

function calcDeptLayout(
  dept: DepartmentGroup,
  startX: number, startY: number,
  accent: string,
): RoomLayout {
  const allAgents = flattenDepartment(dept);
  const cols = 2;
  const rows = Math.ceil(allAgents.length / cols);
  const w = DEPT_COL_W;
  const h = Math.max(200, 50 + rows * DESK_SPACING_Y);

  const agents = allAgents.map((agent, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      agent,
      ax: startX + 85 + col * DESK_SPACING_X,
      ay: startY + 50 + row * DESK_SPACING_Y,
    };
  });

  const leaderName = dept.leader.name.split("—")[1]?.trim() ?? dept.leader.name.split("—")[0]?.trim() ?? "Team";

  return { x: startX, y: startY, w, h, agents, label: leaderName.toUpperCase(), accent };
}

/* ═══════════════════════════════════════════════════════════════
   React component
   ═══════════════════════════════════════════════════════════════ */

export function PixelOffice() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const hoverIdRef = useRef<string | null>(null);
  const textures = useTextures();

  useEffect(() => { setBreadcrumbs([{ label: "Ufficio" }]); }, [setBreadcrumbs]);

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

  /* ── Derived ── */
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

  /* ── Department structure ── */
  const deptData = useMemo(
    () => buildDepartmentGroups(activeAgents),
    [activeAgents],
  );

  /* ── Approval queue ── */
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

  /* ── Layout calculation ── */
  const { layouts, canvasH } = useMemo(() => {
    // CEO office at top center
    const ceoOfficeW = 500;
    const ceoOfficeH = deptData.ceo ? (approvalQueue.length > 0 ? 340 : 220) : 0;

    // Department rooms below CEO
    const deptStartY = 20 + ceoOfficeH + 20;
    const maxCols = Math.floor((CANVAS_W - DEPT_PAD) / (DEPT_COL_W + DEPT_PAD));

    // Collect all room sources: departments + standalone
    const roomSources: Array<{ type: "dept"; dept: DepartmentGroup } | { type: "standalone" }> = [];
    for (const dept of deptData.departments) roomSources.push({ type: "dept", dept });
    if (deptData.standalone.length > 0) roomSources.push({ type: "standalone" });

    const layouts: RoomLayout[] = [];
    const columnBottoms: number[] = new Array(maxCols).fill(deptStartY);

    for (const src of roomSources) {
      // Pick the column with the smallest bottom (pack tightly)
      let bestCol = 0;
      for (let c = 1; c < maxCols; c++) {
        if (columnBottoms[c] < columnBottoms[bestCol]) bestCol = c;
      }

      const x = DEPT_PAD + bestCol * (DEPT_COL_W + DEPT_PAD);
      const y = columnBottoms[bestCol];

      if (src.type === "dept") {
        const theme = getDeptTheme(src.dept.leader.role);
        const layout = calcDeptLayout(src.dept, x, y, theme.accent);
        layouts.push(layout);
        columnBottoms[bestCol] = layout.y + layout.h + DEPT_PAD;
      } else {
        // Standalone agents
        const rows = Math.ceil(deptData.standalone.length / 2);
        const h = Math.max(200, 50 + rows * DESK_SPACING_Y);
        const agents = deptData.standalone.map((agent, i) => ({
          agent,
          ax: x + 85 + (i % 2) * DESK_SPACING_X,
          ay: y + 50 + Math.floor(i / 2) * DESK_SPACING_Y,
        }));
        layouts.push({ x, y, w: DEPT_COL_W, h, agents, label: "STAFF DIRETTO CEO", accent: "#6b7280" });
        columnBottoms[bestCol] = y + h + DEPT_PAD;
      }
    }

    const maxBottom = Math.max(...columnBottoms, deptStartY + 200);
    const canvasH = maxBottom + 20;
    return { layouts, canvasH };
  }, [deptData, approvalQueue.length]);

  /* ── Status counts ── */
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

  /* ── Animation loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !textures) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const loop = (timestamp: number) => {
      if (!running) return;
      const t = timestamp / 1000;
      const selId = chatAgent?.id ?? null;
      const hovId = hoverIdRef.current;

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, CANVAS_W, canvasH);
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, CANVAS_W, canvasH);

      // Floor tiles
      if (textures.floorTile) {
        ctx.save(); ctx.globalAlpha = 0.15;
        const tileS = 50;
        for (let ty = 0; ty < canvasH; ty += tileS) {
          for (let tx = 0; tx < CANVAS_W; tx += tileS) {
            ctx.drawImage(textures.floorTile, tx, ty, tileS, tileS);
          }
        }
        ctx.restore();
      }

      // CEO office
      if (deptData.ceo) {
        const ceoOfficeW = 500;
        const ceoOfficeX = CANVAS_W / 2 - ceoOfficeW / 2;
        drawCEOOffice(ctx, textures, deptData.ceo, approvalQueue, ceoOfficeX, 20, ceoOfficeW, t, selId, hovId);
      }

      // Department rooms
      for (const layout of layouts) {
        drawDeptRoom(ctx, textures, layout, t, selId, hovId, pendingApprovalsByAgent, lastCommentByAgent);
      }

      // Company name
      ctx.font = "bold 14px -apple-system, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText("PAPERCLIP AI", 14, 8);

      // Clock
      drawWallClock(ctx, CANVAS_W - 30, 24, t);

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [textures, canvasH, chatAgent, deptData, approvalQueue, layouts, pendingApprovalsByAgent, lastCommentByAgent]);

  /* ── Hit detection ── */
  const allHitBoxes = useMemo(() => {
    const boxes: Array<{ id: string; agent: Agent; cx: number; cy: number; rx: number; ry: number }> = [];

    // CEO
    if (deptData.ceo) {
      const ceoX = CANVAS_W / 2;
      const ceoY = 70;
      boxes.push({ id: deptData.ceo.id, agent: deptData.ceo, cx: ceoX, cy: ceoY, rx: 35, ry: 45 });

      // Queue agents
      const qLen = approvalQueue.length;
      if (qLen > 0) {
        const ceoOfficeW = 500;
        const spacing = Math.min(80, (ceoOfficeW - 60) / Math.max(qLen, 1));
        const startX = CANVAS_W / 2 - ((qLen - 1) * spacing) / 2;
        approvalQueue.forEach((qa, i) => {
          boxes.push({ id: qa.agent.id, agent: qa.agent, cx: startX + i * spacing, cy: 210, rx: 25, ry: 35 });
        });
      }
    }

    // Department agents
    for (const layout of layouts) {
      for (const { agent, ax, ay } of layout.agents) {
        boxes.push({ id: agent.id, agent, cx: ax, cy: ay + 14, rx: 30, ry: 40 });
      }
    }

    return boxes;
  }, [deptData, approvalQueue, layouts]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = canvasH / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    for (const hb of allHitBoxes) {
      if (Math.abs(mx - hb.cx) < hb.rx && Math.abs(my - hb.cy) < hb.ry) {
        setChatAgent(hb.agent);
        return;
      }
    }
    setChatAgent(null);
  }, [allHitBoxes, canvasH]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = canvasH / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    let foundId: string | null = null;
    for (const hb of allHitBoxes) {
      if (Math.abs(mx - hb.cx) < hb.rx && Math.abs(my - hb.cy) < hb.ry) { foundId = hb.id; break; }
    }
    hoverIdRef.current = foundId;
    canvas.style.cursor = foundId ? "pointer" : "default";
  }, [allHitBoxes, canvasH]);

  const handleMouseLeave = useCallback(() => { hoverIdRef.current = null; }, []);

  // Loading
  if (!textures) {
    return (
      <div className="flex flex-col h-[calc(100vh-48px)]">
        <div className="flex-1 flex items-center justify-center bg-[#0e0e16]">
          <div className="text-muted-foreground text-sm animate-pulse">Caricamento ufficio…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[#0c0c14]">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-violet-400 tracking-wide">UFFICIO</span>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Live</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5 text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-500" /> {statusCounts.active} attivi
          </span>
          <span className="flex items-center gap-1.5 text-gray-400">
            <span className="w-2 h-2 rounded-full bg-gray-500" /> {statusCounts.idle} idle
          </span>
          {statusCounts.paused > 0 && (
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> {statusCounts.paused} in pausa
            </span>
          )}
          {statusCounts.error > 0 && (
            <span className="flex items-center gap-1.5 text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500" /> {statusCounts.error} errore
            </span>
          )}
          <span className="text-muted-foreground">
            {deptData.departments.length} reparti · {activeAgents.length} agenti
          </span>
        </div>
      </div>

      {/* Canvas — scrollable both directions */}
      <div className="relative flex-1 bg-[#0e0e16]" style={{ minHeight: 0 }}>
        <div className="absolute inset-0 overflow-auto">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={canvasH}
            style={{ imageRendering: "pixelated", display: "block", width: CANVAS_W, height: canvasH }}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
        </div>
      </div>

      {/* Chat sheet */}
      <AgentChatSheet
        agent={chatAgent}
        open={chatAgent !== null}
        onOpenChange={(open) => { if (!open) setChatAgent(null); }}
      />
    </div>
  );
}
