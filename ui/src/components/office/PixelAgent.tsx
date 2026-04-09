/**
 * PixelAgent — Animated pixel character with 6 distinct poses.
 *
 * Poses reflect real workflow states:
 * - working: leaned forward, fast typing, monitor glow
 * - waiting: standing up, looking toward leader, clock bubble
 * - idle-short: leaned back, arms crossed, monitor off
 * - idle-long: head down on desk, ZZZ
 * - error: hands on head, panic, red glow
 * - celebrating: arms up, brief (after approval)
 */
import { useEffect, useRef } from "react";

/* ── Palettes ── */
const SKIN_TONES = ["#f0c8a0", "#e0b090", "#d09868", "#b07848", "#905830"];
const HAIR_COLORS = ["#1a1a2e", "#3d2b1f", "#8b4513", "#c5a880", "#b83a14", "#daa520", "#2d1b0e", "#4a2c2a"];
const SHIRT_COLORS = [
  "#4a6fa5", "#6b5b95", "#88b04b", "#ff6f61", "#45b8ac",
  "#d4507a", "#5a7d9a", "#b5838d", "#e6a157", "#7c6f9a",
  "#3a8a6e", "#c06040",
];
const PANT_COLORS = ["#2a2a3e", "#1a2a4a", "#3a2a2a", "#2a3a2a", "#333340"];

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e", running: "#06b6d4", idle: "#6b7280",
  paused: "#f59e0b", error: "#ef4444", terminated: "#374151",
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

const CW = 48;
const CH = 72; // taller to fit standing poses

/* ── Shared: draw head (face, hair, eyes, mouth) ── */
function drawHead(
  ctx: CanvasRenderingContext2D,
  x: number, headY: number,
  skin: string, hair: string, agentHash: number,
  eyeState: "open" | "closed" | "wide" | "down" | "looking-up",
  mouthState: "neutral" | "open" | "frown" | "smile" | "flat",
  tilt: number,
) {
  ctx.save();
  if (tilt) { ctx.translate(x, headY + 8); ctx.rotate(tilt * Math.PI / 180); ctx.translate(-x, -(headY + 8)); }

  // Neck
  ctx.fillStyle = skin; ctx.fillRect(x - 3, headY + 12, 6, 4);
  // Head shape
  ctx.fillStyle = skin; rr(ctx, x - 10, headY - 4, 20, 18, 6); ctx.fill();

  // Hair
  const hs = agentHash % 4;
  ctx.fillStyle = hair;
  if (hs === 0) { rr(ctx, x - 11, headY - 7, 22, 10, 5); ctx.fill(); ctx.fillRect(x - 11, headY - 2, 3, 8); ctx.fillRect(x + 8, headY - 2, 3, 8); }
  else if (hs === 1) { rr(ctx, x - 11, headY - 8, 22, 12, 6); ctx.fill(); rr(ctx, x - 12, headY - 4, 4, 10, 2); ctx.fill(); rr(ctx, x + 8, headY - 4, 4, 10, 2); ctx.fill(); }
  else if (hs === 2) { rr(ctx, x - 12, headY - 8, 24, 11, 6); ctx.fill(); rr(ctx, x - 13, headY - 2, 5, 14, 2); ctx.fill(); rr(ctx, x + 8, headY - 2, 5, 14, 2); ctx.fill(); }
  else { rr(ctx, x - 11, headY - 9, 22, 11, 4); ctx.fill(); ctx.fillRect(x - 8, headY - 11, 3, 5); ctx.fillRect(x - 2, headY - 12, 3, 5); ctx.fillRect(x + 4, headY - 11, 3, 5); }

  // Eyes
  const eyeY = headY + 5;
  if (eyeState === "closed" || eyeState === "down") {
    ctx.strokeStyle = "#1a1a2e"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 7, eyeY + 2); ctx.lineTo(x - 2, eyeY + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 2, eyeY + 2); ctx.lineTo(x + 7, eyeY + 2); ctx.stroke();
  } else if (eyeState === "wide") {
    ctx.fillStyle = "#fff"; rr(ctx, x - 8, eyeY - 1, 6, 5, 2); ctx.fill(); rr(ctx, x + 2, eyeY - 1, 6, 5, 2); ctx.fill();
    ctx.fillStyle = "#1a1a2e"; ctx.fillRect(x - 6, eyeY + 1, 3, 3); ctx.fillRect(x + 3, eyeY + 1, 3, 3);
  } else if (eyeState === "looking-up") {
    ctx.fillStyle = "#fff"; rr(ctx, x - 7, eyeY, 5, 4, 2); ctx.fill(); rr(ctx, x + 2, eyeY, 5, 4, 2); ctx.fill();
    ctx.fillStyle = "#1a1a2e"; ctx.fillRect(x - 5, eyeY, 2, 2); ctx.fillRect(x + 4, eyeY, 2, 2);
  } else {
    ctx.fillStyle = "#fff"; rr(ctx, x - 7, eyeY, 5, 4, 2); ctx.fill(); rr(ctx, x + 2, eyeY, 5, 4, 2); ctx.fill();
    ctx.fillStyle = "#1a1a2e"; ctx.fillRect(x - 5, eyeY + 1, 2, 2); ctx.fillRect(x + 4, eyeY + 1, 2, 2);
  }
  // Eyebrows
  ctx.fillStyle = hair;
  if (eyeState === "wide") {
    ctx.fillRect(x - 8, eyeY - 4, 6, 1); ctx.fillRect(x + 2, eyeY - 4, 6, 1); // raised
  } else {
    ctx.fillRect(x - 7, eyeY - 2, 5, 1); ctx.fillRect(x + 2, eyeY - 2, 5, 1);
  }

  // Mouth
  if (mouthState === "open") { ctx.fillStyle = "#c07060"; rr(ctx, x - 2, headY + 11, 4, 3, 1); ctx.fill(); }
  else if (mouthState === "smile") { ctx.strokeStyle = "#a06050"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, headY + 10, 3, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke(); }
  else if (mouthState === "frown") { ctx.strokeStyle = "#a06050"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, headY + 14, 3, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke(); }
  else if (mouthState === "flat") { ctx.fillStyle = "#a06050"; ctx.fillRect(x - 2, headY + 11, 4, 1); }
  else { ctx.strokeStyle = "#a06050"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, headY + 10, 3, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke(); }

  ctx.restore();
}

/* ── POSE: Working (seated, leaned forward, fast typing) ── */
function drawWorking(ctx: CanvasRenderingContext2D, t: number, h: number, skin: string, hair: string, shirt: string, pants: string) {
  const x = CW / 2;
  const lean = 2; // leaned forward
  const breathY = Math.sin(t * 3 + h) * 0.5;
  const armSpeed = Math.sin(t * 10 + h) * 3; // fast typing

  const seatY = CH - 18;
  const torsoY = seatY - 18 + breathY;
  const headY = torsoY - 16;

  // Legs
  ctx.fillStyle = pants;
  rr(ctx, x - 9, seatY - 2, 7, 12, 2); ctx.fill();
  rr(ctx, x + 2, seatY - 2, 7, 12, 2); ctx.fill();
  ctx.fillStyle = "#1a1a26";
  rr(ctx, x - 10, seatY + 9, 8, 4, 1); ctx.fill();
  rr(ctx, x + 2, seatY + 9, 8, 4, 1); ctx.fill();

  // Torso (leaned forward)
  ctx.fillStyle = shirt;
  ctx.save(); ctx.translate(x, torsoY + 9); ctx.rotate(lean * Math.PI / 180); ctx.translate(-x, -(torsoY + 9));
  rr(ctx, x - 12, torsoY, 24, 18, 3); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.moveTo(x - 4, torsoY); ctx.lineTo(x, torsoY + 4); ctx.lineTo(x + 4, torsoY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(x - 10, torsoY + 1, 8, 16);
  ctx.restore();

  // Arms (fast typing motion)
  ctx.fillStyle = shirt;
  rr(ctx, x - 17, torsoY + 4 + armSpeed, 6, 12, 2); ctx.fill();
  rr(ctx, x + 11, torsoY + 4 - armSpeed, 6, 12, 2); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x - 14, torsoY + 17 + armSpeed, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 14, torsoY + 17 - armSpeed, 3, 0, Math.PI * 2); ctx.fill();

  // Head (focused, looking at screen)
  drawHead(ctx, x + lean, headY, skin, hair, h, "open", "open", 0);

  // Status dot
  const dotColor = STATUS_COLORS.active;
  ctx.fillStyle = dotColor; ctx.strokeStyle = "rgba(10,10,16,0.8)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + 14, headY - 4, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Typing indicator (bouncing dots)
  const dp = t * 6 + h;
  for (let d = 0; d < 3; d++) {
    const a = 0.4 + 0.6 * Math.max(0, Math.sin(dp + d * 1.2));
    ctx.fillStyle = `rgba(34,197,94,${a})`;
    ctx.beginPath(); ctx.arc(x - 6 + d * 6, CH - 4, 2, 0, Math.PI * 2); ctx.fill();
  }

  // Monitor glow
  ctx.fillStyle = `rgba(34,197,94,${0.05 + Math.sin(t * 2) * 0.03})`;
  ctx.fillRect(0, torsoY - 10, CW, 30);
}

/* ── POSE: Waiting approval (standing, looking toward leader) ── */
function drawWaiting(ctx: CanvasRenderingContext2D, t: number, h: number, skin: string, hair: string, shirt: string, pants: string) {
  const x = CW / 2;
  const sway = Math.sin(t * 1.5 + h) * 1.5;

  const feetY = CH - 6;
  const torsoY = feetY - 32;
  const headY = torsoY - 16;

  // Legs (standing)
  ctx.fillStyle = pants;
  rr(ctx, x - 7, feetY - 18, 6, 18, 2); ctx.fill();
  rr(ctx, x + 1, feetY - 18, 6, 18, 2); ctx.fill();
  ctx.fillStyle = "#1a1a26";
  rr(ctx, x - 8, feetY - 2, 7, 4, 1); ctx.fill();
  rr(ctx, x + 1, feetY - 2, 7, 4, 1); ctx.fill();

  // Torso
  ctx.fillStyle = shirt;
  rr(ctx, x - 12 + sway, torsoY, 24, 18, 3); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.moveTo(x - 4 + sway, torsoY); ctx.lineTo(x + sway, torsoY + 4); ctx.lineTo(x + 4 + sway, torsoY); ctx.closePath(); ctx.fill();

  // Arms (one hand on hip, one hanging)
  ctx.fillStyle = shirt;
  rr(ctx, x - 16 + sway, torsoY + 4, 5, 12, 2); ctx.fill(); // left arm hanging
  rr(ctx, x + 10 + sway, torsoY + 2, 5, 8, 2); ctx.fill(); // right arm on hip
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x - 14 + sway, torsoY + 17, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 12 + sway, torsoY + 11, 3, 0, Math.PI * 2); ctx.fill();

  // Head (looking up/toward)
  drawHead(ctx, x + sway, headY, skin, hair, h, "looking-up", "flat", sway * 0.5);

  // Status dot
  ctx.fillStyle = STATUS_COLORS.paused; ctx.strokeStyle = "rgba(10,10,16,0.8)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + 14, headY - 4, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Clock bubble
  ctx.fillStyle = "rgba(245,158,11,0.15)";
  rr(ctx, x - 8, headY - 18, 16, 12, 4); ctx.fill();
  ctx.strokeStyle = "rgba(245,158,11,0.4)"; ctx.lineWidth = 1;
  rr(ctx, x - 8, headY - 18, 16, 12, 4); ctx.stroke();
  ctx.font = "8px sans-serif"; ctx.fillStyle = "rgba(245,158,11,0.7)";
  ctx.textAlign = "center"; ctx.fillText("⏳", x, headY - 9);
}

/* ── POSE: Idle short (leaned back, arms crossed) ── */
function drawIdleShort(ctx: CanvasRenderingContext2D, t: number, h: number, skin: string, hair: string, shirt: string, pants: string) {
  const x = CW / 2;
  const breathY = Math.sin(t * 1.5 + h) * 0.8;

  const seatY = CH - 18;
  const torsoY = seatY - 16 + breathY; // leaned back
  const headY = torsoY - 16;

  // Legs (relaxed, extended)
  ctx.fillStyle = pants;
  rr(ctx, x - 10, seatY - 2, 7, 14, 2); ctx.fill();
  rr(ctx, x + 3, seatY - 2, 7, 14, 2); ctx.fill();
  ctx.fillStyle = "#1a1a26";
  rr(ctx, x - 11, seatY + 11, 8, 4, 1); ctx.fill();
  rr(ctx, x + 3, seatY + 11, 8, 4, 1); ctx.fill();

  // Torso (leaned back)
  ctx.save(); ctx.translate(x, torsoY + 9); ctx.rotate(-3 * Math.PI / 180); ctx.translate(-x, -(torsoY + 9));
  ctx.fillStyle = shirt;
  rr(ctx, x - 12, torsoY, 24, 18, 3); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.moveTo(x - 4, torsoY); ctx.lineTo(x, torsoY + 4); ctx.lineTo(x + 4, torsoY); ctx.closePath(); ctx.fill();
  ctx.restore();

  // Arms crossed
  ctx.fillStyle = shirt;
  rr(ctx, x - 10, torsoY + 8, 20, 5, 2); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x - 10, torsoY + 10, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 10, torsoY + 10, 3, 0, Math.PI * 2); ctx.fill();

  // Head (looking slightly away)
  drawHead(ctx, x, headY, skin, hair, h, "open", "neutral", -2);

  // Status dot (gray)
  ctx.fillStyle = STATUS_COLORS.idle; ctx.strokeStyle = "rgba(10,10,16,0.8)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + 12, headY - 4, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

/* ── POSE: Idle reading (seated, one hand on chin, looking at screen) ── */
function drawIdleReading(ctx: CanvasRenderingContext2D, t: number, h: number, skin: string, hair: string, shirt: string, pants: string) {
  const x = CW / 2;
  const breathY = Math.sin(t * 1.2 + h) * 0.6;

  const seatY = CH - 18;
  const torsoY = seatY - 18 + breathY;
  const headY = torsoY - 16;

  // Legs
  ctx.fillStyle = pants;
  rr(ctx, x - 9, seatY - 2, 7, 12, 2); ctx.fill();
  rr(ctx, x + 2, seatY - 2, 7, 12, 2); ctx.fill();
  ctx.fillStyle = "#1a1a26";
  rr(ctx, x - 10, seatY + 9, 8, 4, 1); ctx.fill();
  rr(ctx, x + 2, seatY + 9, 8, 4, 1); ctx.fill();

  // Torso (upright, slight lean)
  ctx.fillStyle = shirt;
  rr(ctx, x - 12, torsoY, 24, 18, 3); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.moveTo(x - 4, torsoY); ctx.lineTo(x, torsoY + 4); ctx.lineTo(x + 4, torsoY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(x - 10, torsoY + 1, 8, 16);

  // Left arm (resting on desk)
  ctx.fillStyle = shirt;
  rr(ctx, x - 17, torsoY + 6, 6, 12, 2); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x - 14, torsoY + 19, 3, 0, Math.PI * 2); ctx.fill();

  // Right arm (hand on chin — thinking)
  ctx.fillStyle = shirt;
  rr(ctx, x + 10, torsoY + 2, 5, 8, 2); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x + 8, headY + 10, 3, 0, Math.PI * 2); ctx.fill();

  // Head (looking at screen, slight tilt)
  drawHead(ctx, x, headY, skin, hair, h, "open", "neutral", 2);

  // Status dot (gray)
  ctx.fillStyle = STATUS_COLORS.idle; ctx.strokeStyle = "rgba(10,10,16,0.8)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + 12, headY - 4, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Soft monitor glow (reading)
  ctx.fillStyle = `rgba(100,140,255,${0.03 + Math.sin(t * 0.8) * 0.015})`;
  ctx.fillRect(0, torsoY - 8, CW, 24);
}

/* ── POSE: Idle coffee (seated, holding mug, relaxed) ── */
function drawIdleCoffee(ctx: CanvasRenderingContext2D, t: number, h: number, skin: string, hair: string, shirt: string, pants: string) {
  const x = CW / 2;
  const breathY = Math.sin(t * 1.0 + h) * 0.7;
  const sipCycle = Math.sin(t * 0.5 + h);

  const seatY = CH - 18;
  const torsoY = seatY - 17 + breathY;
  const headY = torsoY - 16;

  // Legs (crossed)
  ctx.fillStyle = pants;
  rr(ctx, x - 9, seatY - 2, 7, 12, 2); ctx.fill();
  rr(ctx, x + 1, seatY - 4, 7, 14, 2); ctx.fill(); // crossed leg higher
  ctx.fillStyle = "#1a1a26";
  rr(ctx, x - 10, seatY + 9, 8, 4, 1); ctx.fill();
  rr(ctx, x + 1, seatY + 9, 8, 4, 1); ctx.fill();

  // Torso (leaned back slightly)
  ctx.save(); ctx.translate(x, torsoY + 9); ctx.rotate(-2 * Math.PI / 180); ctx.translate(-x, -(torsoY + 9));
  ctx.fillStyle = shirt;
  rr(ctx, x - 12, torsoY, 24, 18, 3); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.moveTo(x - 4, torsoY); ctx.lineTo(x, torsoY + 4); ctx.lineTo(x + 4, torsoY); ctx.closePath(); ctx.fill();
  ctx.restore();

  // Left arm (resting)
  ctx.fillStyle = shirt;
  rr(ctx, x - 16, torsoY + 6, 5, 12, 2); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x - 14, torsoY + 19, 3, 0, Math.PI * 2); ctx.fill();

  // Right arm (holding mug up)
  const mugY = torsoY + 2 + (sipCycle > 0.7 ? -3 : 0); // sip animation
  ctx.fillStyle = shirt;
  rr(ctx, x + 9, torsoY + 2, 5, 10, 2); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x + 14, mugY + 8, 3, 0, Math.PI * 2); ctx.fill();

  // Coffee mug
  ctx.fillStyle = "#d4d4d8";
  rr(ctx, x + 11, mugY + 4, 7, 6, 1); ctx.fill();
  ctx.strokeStyle = "#a1a1aa"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x + 19, mugY + 7, 2, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke(); // handle
  // Steam
  if (sipCycle < 0.7) {
    ctx.fillStyle = `rgba(200,200,200,${0.2 + Math.sin(t * 2 + h) * 0.1})`;
    ctx.beginPath(); ctx.arc(x + 14, mugY + 1 + Math.sin(t * 1.5) * 1, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 15, mugY - 2 + Math.sin(t * 1.5 + 1) * 1, 1, 0, Math.PI * 2); ctx.fill();
  }

  // Head (relaxed, slight smile)
  drawHead(ctx, x, headY, skin, hair, h, "open", "smile", -1);

  // Status dot (gray)
  ctx.fillStyle = STATUS_COLORS.idle; ctx.strokeStyle = "rgba(10,10,16,0.8)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + 12, headY - 4, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

/* ── POSE: Idle long / paused (head on desk, sleeping) ── */
function drawIdleLong(ctx: CanvasRenderingContext2D, t: number, h: number, skin: string, hair: string, shirt: string, pants: string) {
  const x = CW / 2;
  const breathY = Math.sin(t * 1.2 + h) * 0.5;

  const seatY = CH - 18;
  const torsoY = seatY - 14 + breathY;

  // Legs (relaxed)
  ctx.fillStyle = pants;
  rr(ctx, x - 9, seatY - 2, 7, 12, 2); ctx.fill();
  rr(ctx, x + 2, seatY - 2, 7, 12, 2); ctx.fill();

  // Torso (slumped forward onto desk)
  ctx.fillStyle = shirt;
  ctx.save(); ctx.translate(x, torsoY + 9); ctx.rotate(15 * Math.PI / 180); ctx.translate(-x, -(torsoY + 9));
  rr(ctx, x - 12, torsoY, 24, 18, 3); ctx.fill();
  ctx.restore();

  // Arms (folded on desk, head resting on them)
  ctx.fillStyle = shirt;
  rr(ctx, x - 14, torsoY + 10, 28, 5, 2); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x - 14, torsoY + 12, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 14, torsoY + 12, 3, 0, Math.PI * 2); ctx.fill();

  // Head (resting on arms, sideways)
  ctx.fillStyle = skin; rr(ctx, x - 8, torsoY - 4, 18, 14, 6); ctx.fill();
  ctx.fillStyle = hair;
  const hs = h % 4;
  if (hs < 2) { rr(ctx, x - 9, torsoY - 7, 20, 8, 5); ctx.fill(); }
  else { rr(ctx, x - 10, torsoY - 8, 22, 9, 4); ctx.fill(); }

  // Closed eyes
  ctx.strokeStyle = "#1a1a2e"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - 4, torsoY + 3); ctx.lineTo(x + 1, torsoY + 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 4, torsoY + 3); ctx.lineTo(x + 9, torsoY + 3); ctx.stroke();

  // ZZZ (bigger, more visible)
  ctx.font = "bold 9px sans-serif"; ctx.fillStyle = "rgba(245,158,11,0.5)";
  const zP = t * 0.6;
  ctx.fillText("z", x + 12, torsoY - 8 + Math.sin(zP) * 2);
  ctx.fillText("Z", x + 16, torsoY - 16 + Math.sin(zP + 1) * 2);
  ctx.fillText("Z", x + 12, torsoY - 24 + Math.sin(zP + 2) * 2);

  // Status dot
  ctx.fillStyle = STATUS_COLORS.paused; ctx.strokeStyle = "rgba(10,10,16,0.8)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + 18, torsoY - 8, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

/* ── POSE: Error (hands on head, panicking) ── */
function drawError(ctx: CanvasRenderingContext2D, t: number, h: number, skin: string, hair: string, shirt: string, pants: string) {
  const x = CW / 2;
  const shake = Math.sin(t * 12 + h) * 1.5;
  const breathY = Math.sin(t * 4 + h) * 1;

  const seatY = CH - 18;
  const torsoY = seatY - 18 + breathY;
  const headY = torsoY - 16;

  // Red glow
  ctx.fillStyle = `rgba(239,68,68,${0.06 + Math.sin(t * 3) * 0.04})`;
  ctx.fillRect(0, 0, CW, CH);

  // Legs
  ctx.fillStyle = pants;
  rr(ctx, x - 9, seatY - 2, 7, 12, 2); ctx.fill();
  rr(ctx, x + 2, seatY - 2, 7, 12, 2); ctx.fill();

  // Torso (shaking)
  ctx.fillStyle = shirt;
  rr(ctx, x - 12 + shake, torsoY, 24, 18, 3); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.moveTo(x - 4 + shake, torsoY); ctx.lineTo(x + shake, torsoY + 4); ctx.lineTo(x + 4 + shake, torsoY); ctx.closePath(); ctx.fill();

  // Arms ON HEAD (panic)
  ctx.fillStyle = shirt;
  rr(ctx, x - 14 + shake, torsoY - 8, 6, 16, 2); ctx.fill();
  rr(ctx, x + 8 + shake, torsoY - 8, 6, 16, 2); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x - 11 + shake, headY + 2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 11 + shake, headY + 2, 3, 0, Math.PI * 2); ctx.fill();

  // Head (wide-eyed panic)
  drawHead(ctx, x + shake, headY, skin, hair, h, "wide", "frown", shake * 0.5);

  // "!" bubble
  ctx.fillStyle = "rgba(239,68,68,0.2)";
  rr(ctx, x - 6, headY - 20, 12, 14, 4); ctx.fill();
  ctx.strokeStyle = "rgba(239,68,68,0.5)"; ctx.lineWidth = 1;
  rr(ctx, x - 6, headY - 20, 12, 14, 4); ctx.stroke();
  ctx.font = "bold 10px sans-serif"; ctx.fillStyle = "#ef4444";
  ctx.textAlign = "center"; ctx.fillText("!", x, headY - 10);

  // Status dot
  ctx.fillStyle = STATUS_COLORS.error; ctx.strokeStyle = "rgba(10,10,16,0.8)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + 14, headY - 4, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

/* ── Main draw dispatcher ── */
function drawCharacter(ctx: CanvasRenderingContext2D, status: string, time: number, agentHash: number) {
  const skin = SKIN_TONES[agentHash % SKIN_TONES.length];
  const hair = HAIR_COLORS[(agentHash >> 4) % HAIR_COLORS.length];
  const shirt = SHIRT_COLORS[(agentHash >> 8) % SHIRT_COLORS.length];
  const pants = PANT_COLORS[(agentHash >> 12) % PANT_COLORS.length];

  ctx.clearRect(0, 0, CW, CH);

  switch (status) {
    case "active":
    case "running":
      drawWorking(ctx, time, agentHash, skin, hair, shirt, pants);
      break;
    case "error":
      drawError(ctx, time, agentHash, skin, hair, shirt, pants);
      break;
    case "paused":
      drawIdleLong(ctx, time, agentHash, skin, hair, shirt, pants);
      break;
    case "idle":
    default: {
      // Vary idle pose by agent hash so office looks alive
      const idleVariant = agentHash % 3;
      if (idleVariant === 0) drawIdleShort(ctx, time, agentHash, skin, hair, shirt, pants);
      else if (idleVariant === 1) drawIdleReading(ctx, time, agentHash, skin, hair, shirt, pants);
      else drawIdleCoffee(ctx, time, agentHash, skin, hair, shirt, pants);
      break;
    }
  }
}

/* ── React component ── */
interface PixelAgentProps {
  agentId: string;
  status: string;
  scale?: number;
  className?: string;
}

export function PixelAgent({ agentId, status, scale = 1.5, className }: PixelAgentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const agentHash = hash(agentId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let running = true;
    const loop = (timestamp: number) => {
      if (!running) return;
      drawCharacter(ctx, status, timestamp / 1000, agentHash);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [status, agentHash]);

  const displayW = Math.round(CW * scale);
  const displayH = Math.round(CH * scale);

  return (
    <canvas
      ref={canvasRef}
      width={CW * 2}
      height={CH * 2}
      className={className}
      style={{ imageRendering: "pixelated", width: displayW, height: displayH }}
    />
  );
}
