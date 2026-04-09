/**
 * PixelOffice v4 — Bitmap sprite rendering with Canvas 2D.
 *
 * Uses real sprite assets (MIT, from claude-office) for furniture,
 * procedural characters with improved quality, and proper layering
 * with y-sorting for depth.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { approvalsApi } from "../api/approvals";
import { activityApi } from "../api/activity";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { AgentChatSheet } from "../components/AgentChatSheet";
import type { Agent, Approval, ActivityEvent } from "@paperclipai/shared";

/* ═══════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════ */

const CANVAS_W = 940;
const BASE_CANVAS_H = 680;
const BG_COLOR = "#1a1a1a";

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

const ACCESSORY_TINTS = [
  null, "#87ceeb", "#98fb98", "#ffb6c1", "#dda0dd",
  "#f0e68c", "#87cefa", "#ffa07a",
];

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
  _opts?: { tint?: string | null; alpha?: number },
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
   Character drawing (procedural — capsule style like claude-office)
   ═══════════════════════════════════════════════════════════════ */

function drawAgent(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  _color: string,
  status: string,
  time: number,
  agentHash: number,
  isSelected: boolean,
) {
  const isWorking = status === "active" || status === "running";
  const isError = status === "error";
  const isPaused = status === "paused";
  const skin = SKIN_TONES[agentHash % SKIN_TONES.length];
  const hair = HAIR_COLORS[(agentHash >> 4) % HAIR_COLORS.length];
  const shirt = SHIRT_COLORS[(agentHash >> 8) % SHIRT_COLORS.length];
  const pants = PANT_COLORS[(agentHash >> 12) % PANT_COLORS.length];
  const dotColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;

  // Animation
  const breathY = Math.sin(time * 2.5 + agentHash) * 1;
  const armBob = isWorking ? Math.sin(time * 8 + agentHash) * 2.5 : 0;
  const headTilt = isPaused ? Math.sin(time * 0.8 + agentHash) * 2 : 0;

  // Character origin: x = center, y = feet/seat level
  // Seated character is roughly 50px tall from seat to top of hair
  const seatY = y; // where they sit
  const torsoY = seatY - 18 + breathY;
  const headY = torsoY - 16;

  ctx.save();

  // Selection ring
  if (isSelected) {
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.ellipse(x, seatY + 4, 24, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Legs (under desk, partially visible) ──
  ctx.fillStyle = pants;
  // Upper legs (seated, going forward)
  roundRect(ctx, x - 9, seatY - 2, 7, 12, 2); ctx.fill();
  roundRect(ctx, x + 2, seatY - 2, 7, 12, 2); ctx.fill();
  // Shoes
  ctx.fillStyle = "#1a1a26";
  roundRect(ctx, x - 10, seatY + 9, 8, 4, 1); ctx.fill();
  roundRect(ctx, x + 2, seatY + 9, 8, 4, 1); ctx.fill();

  // ── Torso / shirt ──
  ctx.fillStyle = shirt;
  roundRect(ctx, x - 12, torsoY, 24, 18, 3);
  ctx.fill();
  // Shirt collar
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(x - 4, torsoY);
  ctx.lineTo(x, torsoY + 4);
  ctx.lineTo(x + 4, torsoY);
  ctx.closePath();
  ctx.fill();
  // Shirt highlight
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(x - 10, torsoY + 1, 8, 16);

  // ── Arms ──
  ctx.fillStyle = shirt;
  // Left arm (shoulder to elbow)
  roundRect(ctx, x - 17, torsoY + 2 + armBob, 6, 14, 2); ctx.fill();
  // Right arm
  roundRect(ctx, x + 11, torsoY + 2 - armBob, 6, 14, 2); ctx.fill();
  // Hands (skin)
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x - 14, torsoY + 17 + armBob, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 14, torsoY + 17 - armBob, 3, 0, Math.PI * 2); ctx.fill();

  // ── Head ──
  ctx.save();
  if (headTilt) ctx.translate(x, headY + 8);
  if (headTilt) ctx.rotate(headTilt * Math.PI / 180);
  if (headTilt) ctx.translate(-x, -(headY + 8));

  // Neck
  ctx.fillStyle = skin;
  ctx.fillRect(x - 3, torsoY - 2, 6, 4);

  // Head shape
  ctx.fillStyle = skin;
  roundRect(ctx, x - 10, headY - 4, 20, 18, 6);
  ctx.fill();

  // Hair — varies by hash
  const hairStyle = agentHash % 4;
  ctx.fillStyle = hair;
  if (hairStyle === 0) {
    // Short crop
    roundRect(ctx, x - 11, headY - 7, 22, 10, 5); ctx.fill();
    ctx.fillRect(x - 11, headY - 2, 3, 8); // sideburn L
    ctx.fillRect(x + 8, headY - 2, 3, 8); // sideburn R
  } else if (hairStyle === 1) {
    // Swept back
    roundRect(ctx, x - 11, headY - 8, 22, 12, 6); ctx.fill();
    roundRect(ctx, x - 12, headY - 4, 4, 10, 2); ctx.fill();
    roundRect(ctx, x + 8, headY - 4, 4, 10, 2); ctx.fill();
  } else if (hairStyle === 2) {
    // Longer / bob
    roundRect(ctx, x - 12, headY - 8, 24, 11, 6); ctx.fill();
    roundRect(ctx, x - 13, headY - 2, 5, 14, 2); ctx.fill();
    roundRect(ctx, x + 8, headY - 2, 5, 14, 2); ctx.fill();
  } else {
    // Spiky / messy
    roundRect(ctx, x - 11, headY - 9, 22, 11, 4); ctx.fill();
    ctx.fillRect(x - 8, headY - 11, 3, 5);
    ctx.fillRect(x - 2, headY - 12, 3, 5);
    ctx.fillRect(x + 4, headY - 11, 3, 5);
  }

  // Eyes
  const eyeY = headY + 5;
  ctx.fillStyle = "#fff";
  roundRect(ctx, x - 7, eyeY, 5, 4, 2); ctx.fill();
  roundRect(ctx, x + 2, eyeY, 5, 4, 2); ctx.fill();
  // Pupils
  ctx.fillStyle = "#1a1a2e";
  const px = isWorking ? 1 : 0;
  const py = isWorking ? 1 : 0;
  ctx.fillRect(x - 5 + px, eyeY + 1 + py, 2, 2);
  ctx.fillRect(x + 4 + px, eyeY + 1 + py, 2, 2);

  // Eyebrows
  ctx.fillStyle = hair;
  ctx.fillRect(x - 7, eyeY - 2, 5, 1);
  ctx.fillRect(x + 2, eyeY - 2, 5, 1);
  if (isError) {
    // Angry eyebrows for error
    ctx.fillRect(x - 8, eyeY - 3, 3, 1);
    ctx.fillRect(x + 5, eyeY - 3, 3, 1);
  }

  // Mouth
  if (isWorking) {
    // Slight open mouth (concentrating)
    ctx.fillStyle = "#c07060";
    roundRect(ctx, x - 2, headY + 11, 4, 2, 1); ctx.fill();
  } else if (isError) {
    // Frown
    ctx.strokeStyle = "#a06050";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, headY + 14, 3, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  } else if (isPaused) {
    // Sleepy line
    ctx.fillStyle = "#a06050";
    ctx.fillRect(x - 2, headY + 11, 4, 1);
  } else {
    // Slight smile
    ctx.strokeStyle = "#a06050";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, headY + 10, 3, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  }

  ctx.restore(); // head tilt

  // ── Status dot ──
  ctx.fillStyle = dotColor;
  ctx.strokeStyle = "#0a0a10";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + 12, headY - 4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // ── Typing indicator dots ──
  if (isWorking) {
    const dotPhase = time * 5 + agentHash;
    for (let d = 0; d < 3; d++) {
      const a = 0.3 + 0.7 * Math.max(0, Math.sin(dotPhase + d * 1.2));
      ctx.fillStyle = `rgba(34,197,94,${a})`;
      ctx.beginPath();
      ctx.arc(x - 6 + d * 6, seatY + 18, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── ZZZ for paused ──
  if (isPaused) {
    ctx.font = "bold 8px sans-serif";
    ctx.fillStyle = "rgba(245,158,11,0.6)";
    const zPhase = time * 0.5;
    ctx.fillText("z", x + 14, headY - 6 + Math.sin(zPhase) * 2);
    ctx.fillText("Z", x + 18, headY - 14 + Math.sin(zPhase + 1) * 2);
    ctx.fillText("Z", x + 22, headY - 22 + Math.sin(zPhase + 2) * 2);
  }

  ctx.restore();
}

/* ═══════════════════════════════════════════════════════════════
   Name tag + bubble
   ═══════════════════════════════════════════════════════════════ */

function drawNameTag(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, status: string) {
  const label = name.split("—")[0]?.trim().split(" ")[0] ?? "";
  const dotColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;

  ctx.font = "bold 11px -apple-system, sans-serif";
  const nameW = ctx.measureText(label).width;
  const padX = 8;
  const h = 20;
  const w = nameW + padX * 2 + 14; // +14 for dot

  // Background
  ctx.fillStyle = "rgba(15,23,42,0.90)";
  roundRect(ctx, x - w / 2, y, w, h, 4);
  ctx.fill();
  ctx.strokeStyle = dotColor;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x - w / 2, y, w, h, 4);
  ctx.stroke();

  // Status dot
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(x - w / 2 + 10, y + h / 2, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Name
  ctx.fillStyle = "#e2e8f0";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x - w / 2 + 20, y + h / 2);
}

function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, urgent: boolean) {
  ctx.font = "9px -apple-system, sans-serif";
  const maxW = 130;
  // Single line, truncated
  const clean = text.replace(/^#+\s*/gm, "").replace(/\n/g, " ").trim();
  const display = ctx.measureText(clean).width > maxW
    ? clean.slice(0, 30) + "…"
    : clean;
  const textW = ctx.measureText(display).width;
  const padX = 6;
  const padY = 4;
  const w = textW + padX * 2;
  const h = 16;
  const bx = x - w / 2;
  const by = y - h - 6;

  // Body
  ctx.fillStyle = urgent ? "rgba(127,29,29,0.92)" : "rgba(30,27,50,0.92)";
  ctx.strokeStyle = urgent ? "rgba(239,68,68,0.6)" : "rgba(139,92,246,0.5)";
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, w, h, 5);
  ctx.fill();
  ctx.stroke();

  // Arrow
  ctx.beginPath();
  ctx.moveTo(x - 4, by + h);
  ctx.lineTo(x, by + h + 4);
  ctx.lineTo(x + 4, by + h);
  ctx.closePath();
  ctx.fillStyle = urgent ? "rgba(127,29,29,0.92)" : "rgba(30,27,50,0.92)";
  ctx.fill();

  // Text
  ctx.fillStyle = urgent ? "#fca5a5" : "#c4b5fd";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(display, x, by + h / 2);
}


/* ═══════════════════════════════════════════════════════════════
   Main render loop
   ═══════════════════════════════════════════════════════════════ */

interface DeskSlot {
  agent: Agent;
  deskX: number;
  deskY: number;
  color: string;
  accessoryTint: string | null;
  accessoryKey: string;
  bubble?: { text: string; urgent: boolean };
}

const DESK_ITEMS = ["lamp", "mug", "eightBall", "stapler", "penHolder", "thermos", "duck"];

function renderFrame(
  ctx: CanvasRenderingContext2D,
  tex: Textures,
  slots: DeskSlot[],
  time: number,
  selectedId: string | null,
  hoverId: string | null,
  canvasH: number,
) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, CANVAS_W, canvasH);

  // ── Background ──
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, canvasH);

  // ── Floor tiles ──
  const floorTile = tex.floorTile;
  if (floorTile) {
    const tileS = 50;
    for (let ty = 0; ty < canvasH; ty += tileS) {
      for (let tx = 0; tx < CANVAS_W; tx += tileS) {
        ctx.drawImage(floorTile, tx, ty, tileS, tileS);
      }
    }
  }

  // ── Wall (top bar) ──
  const wallGrad = ctx.createLinearGradient(0, 0, 0, 100);
  wallGrad.addColorStop(0, "#2a2a3a");
  wallGrad.addColorStop(1, "#1f1f2e");
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, CANVAS_W, 100);
  // Baseboard
  ctx.fillStyle = "#3a3a4a";
  ctx.fillRect(0, 97, CANVAS_W, 4);

  // ── Decorations ──
  if (tex.plant) {
    drawSprite(ctx, tex.plant, 10, 50, 60, 80);
    drawSprite(ctx, tex.plant, CANVAS_W - 80, 55, 60, 80);
  }
  if (tex.watercooler) {
    drawSprite(ctx, tex.watercooler, CANVAS_W - 150, 40, 40, 120);
  }
  if (tex.coffeeMachine) {
    drawSprite(ctx, tex.coffeeMachine, 90, 14, 70, 76);
  }
  if (tex.printer) {
    drawSprite(ctx, tex.printer, 190, 18, 80, 74);
  }

  // ── Y-sorted rendering ──
  const sorted = [...slots].sort((a, b) => a.deskY - b.deskY);

  for (const slot of sorted) {
    const { deskX, deskY, agent, color, accessoryKey } = slot;
    const isSelected = selectedId === agent.id;
    const isHovered = hoverId === agent.id;
    const agentHash = hash(agent.id);

    // Hover glow under the whole desk area
    if (isHovered && !isSelected) {
      ctx.save();
      ctx.fillStyle = "rgba(167,139,250,0.06)";
      roundRect(ctx, deskX - 80, deskY - 20, 160, 140, 8);
      ctx.fill();
      ctx.restore();
    }

    // 1. Chair (furthest back)
    if (tex.chair) {
      drawSprite(ctx, tex.chair, deskX - 20, deskY - 8, 40, 64);
    }

    // 2. Monitor (behind agent, on desk surface)
    if (tex.monitor) {
      drawSprite(ctx, tex.monitor, deskX - 24, deskY - 4, 48, 40);
    }

    // 3. Agent character (sitting in front of monitor)
    const agentFeetY = deskY + 16;
    drawAgent(ctx, deskX, agentFeetY, color, agent.status, time, agentHash, isSelected || isHovered);

    // 4. Desk surface (in front of agent's lower body)
    if (tex.desk) {
      drawSprite(ctx, tex.desk, deskX - 75, deskY + 28, 150, 80);
    }

    // 5. Keyboard (on desk surface)
    if (tex.keyboard) {
      drawSprite(ctx, tex.keyboard, deskX - 24, deskY + 40, 48, 13);
    }

    // 6. Desk accessory (on desk, right side)
    const accTex = tex[accessoryKey];
    if (accTex) {
      drawSprite(ctx, accTex, deskX + 38, deskY + 34, 22, 22);
    }

    // 7. Name tag (below desk)
    drawNameTag(ctx, deskX, deskY + 110, agent.name, agent.status);
  }

  // ── Bubbles drawn LAST (top layer, above everything) ──
  for (const slot of sorted) {
    if (slot.bubble) {
      drawBubble(ctx, slot.deskX, slot.deskY - 60, slot.bubble.text, slot.bubble.urgent);
    }
  }

  // ── Wall clock ──
  drawWallClock(ctx, CANVAS_W / 2, 45, time);

  // ── Company name on wall ──
  ctx.font = "bold 16px -apple-system, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PAPERCLIP AI", CANVAS_W / 2, 20);
}

function drawWallClock(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  // Frame
  ctx.fillStyle = "#111";
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Face
  ctx.fillStyle = "#1a1a2a";
  ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
  // Hour marks
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.fillStyle = "#555";
    ctx.fillRect(x + Math.cos(angle) * 12 - 1, y + Math.sin(angle) * 12 - 1, 2, 2);
  }
  // Hands (based on real time offset for variety)
  const hourAngle = (time / 120) * Math.PI * 2 - Math.PI / 2;
  const minAngle = (time / 10) * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(hourAngle) * 8, y + Math.sin(hourAngle) * 8); ctx.stroke();
  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(minAngle) * 11, y + Math.sin(minAngle) * 11); ctx.stroke();
  // Center
  ctx.fillStyle = "#ef4444";
  ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
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

  useEffect(() => {
    setBreadcrumbs([{ label: "Ufficio" }]);
  }, [setBreadcrumbs]);

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

  /* ── Desk slots ── */
  const { slots, canvasH } = useMemo<{ slots: DeskSlot[]; canvasH: number }>(() => {
    const cols = 4;
    const startX = 130;
    const startY = 140;
    const spacingX = 200;
    const spacingY = 200;
    const rows = Math.ceil(activeAgents.length / cols);
    const canvasH = Math.max(BASE_CANVAS_H, startY + rows * spacingY + 50);

    const slots = activeAgents.map((agent, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const deskX = startX + col * spacingX;
      const deskY = startY + row * spacingY;

      const pending = pendingApprovalsByAgent.get(agent.id);
      const comment = lastCommentByAgent.get(agent.id);
      const hasPending = pending && pending.length > 0;

      let bubble: DeskSlot["bubble"] = undefined;
      if (hasPending) {
        const text = (pending[0].payload as Record<string, unknown> | null)?.stepTitle as string ??
          pending[0].type.replaceAll("_", " ");
        bubble = { text, urgent: true };
      } else if (comment) {
        const text = (comment.details as Record<string, unknown> | null)?.bodySnippet as string;
        if (text) bubble = { text: text.length > 60 ? text.slice(0, 57) + "…" : text, urgent: false };
      }

      const accessoryIdx = i % DESK_ITEMS.length;

      return {
        agent,
        deskX,
        deskY,
        color: SHIRT_COLORS[hash(agent.id) % SHIRT_COLORS.length],
        accessoryTint: ACCESSORY_TINTS[i % ACCESSORY_TINTS.length],
        accessoryKey: DESK_ITEMS[accessoryIdx],
        bubble,
      };
    });
    return { slots, canvasH };
  }, [activeAgents, pendingApprovalsByAgent, lastCommentByAgent]);

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
      renderFrame(ctx, textures, slots, timestamp / 1000, chatAgent?.id ?? null, hoverIdRef.current, canvasH);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [slots, chatAgent, textures, canvasH]);

  /* ── Click detection ── */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = canvasH / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    for (const slot of slots) {
      const dx = mx - slot.deskX;
      const dy = my - (slot.deskY + 10); // agent feet Y
      if (Math.abs(dx) < 25 && dy > -70 && dy < 10) {
        setChatAgent(slot.agent);
        return;
      }
    }
    setChatAgent(null);
  }, [slots]);

  /* ── Cursor + hover tracking ── */
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = canvasH / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    let foundId: string | null = null;
    for (const slot of slots) {
      const dx = mx - slot.deskX;
      const dy = my - (slot.deskY + 16);
      if (Math.abs(dx) < 30 && dy > -70 && dy < 20) { foundId = slot.agent.id; break; }
    }
    hoverIdRef.current = foundId;
    canvas.style.cursor = foundId ? "pointer" : "default";
  }, [slots]);

  const handleMouseLeave = useCallback(() => { hoverIdRef.current = null; }, []);

  // Loading state
  if (!textures) {
    return (
      <div className="flex flex-col h-[calc(100vh-48px)]">
        <div className="flex-1 flex items-center justify-center bg-[#1a1a1a]">
          <div className="text-muted-foreground text-sm animate-pulse">Caricamento ufficio…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-[#0c0c14]">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-violet-400 tracking-wide">UFFICIO</span>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Live</span>
          </div>
        </div>
        <div className="flex items-center gap-5 text-[11px]">
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
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto bg-[#1a1a1a]">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={canvasH}
          style={{ imageRendering: "pixelated", width: CANVAS_W, height: canvasH }}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
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
