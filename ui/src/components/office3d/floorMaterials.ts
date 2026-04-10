/**
 * Floor texture generators for v12 multi-room office. Each room has its own
 * material to give the layout a stronger sense of "this is a different
 * place" — warm wood for the executive/creative zones, cool epoxy for tech,
 * neutral concrete for the lab, soft carpet for the lounge.
 *
 * All textures are procedural CanvasTextures so we don't need any asset
 * pipeline. Sizes are kept modest (256-512px) since the floors are seen at
 * a near top-down camera angle and don't need heavy detail.
 */
import * as THREE from "three";
import type { FloorMaterial } from "./officeRooms";

/** Warm parquet planks (CEO Office, Creative Studio) */
export function makeParquetWarm(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#6b4226";
  ctx.fillRect(0, 0, size, size);

  const plankW = 64;
  const plankH = 16;
  for (let y = 0; y < size; y += plankH) {
    for (let x = 0; x < size; x += plankW) {
      const offsetX = (Math.floor(y / plankH) % 2) * (plankW / 2);
      const px = (x + offsetX) % size;
      const shade = 0.78 + Math.random() * 0.24;
      const r = Math.floor(107 * shade);
      const g = Math.floor(66 * shade);
      const b = Math.floor(38 * shade);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(px, y, plankW - 1, plankH - 1);

      ctx.strokeStyle = `rgba(30, 18, 10, 0.35)`;
      ctx.lineWidth = 0.5;
      const grainCount = 3 + Math.floor(Math.random() * 3);
      for (let g = 0; g < grainCount; g++) {
        const gy = y + 2 + Math.random() * (plankH - 4);
        ctx.beginPath();
        ctx.moveTo(px, gy);
        ctx.lineTo(px + plankW, gy + (Math.random() - 0.5) * 1.5);
        ctx.stroke();
      }
    }
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "rgba(255, 220, 150, 0.08)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.12)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Glossy blue-tinted epoxy floor (Tech Lab) */
export function makeEpoxyBlue(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Base deep blue
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#1a2842");
  grad.addColorStop(1, "#243558");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle hex grid pattern
  ctx.strokeStyle = "rgba(120, 160, 220, 0.18)";
  ctx.lineWidth = 1;
  for (let x = 0; x < size; x += 32) {
    for (let y = 0; y < size; y += 32) {
      ctx.strokeRect(x, y, 32, 32);
    }
  }

  // Speckle (pebbles in the epoxy)
  for (let i = 0; i < 600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const lum = Math.random() * 0.6 + 0.2;
    ctx.fillStyle = `rgba(180, 200, 240, ${lum * 0.25})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Highlight streaks for the "glossy" look
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 8;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 60);
    ctx.lineTo(size, i * 60 + 30);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft warm-grey shaggy carpet (Lounge) */
export function makeCarpetGray(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#6e5a4a";
  ctx.fillRect(0, 0, size, size);

  // Noise — short fibers in lots of warm earth tones
  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const t = Math.random();
    const r = Math.floor(110 + t * 50);
    const g = Math.floor(90 + t * 35);
    const b = Math.floor(70 + t * 25);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.4 + Math.random() * 0.4})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Coarser fiber strokes
  ctx.strokeStyle = "rgba(180, 150, 110, 0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Polished concrete (Creative Lab) */
export function makeConcrete(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#7a7670";
  ctx.fillRect(0, 0, size, size);

  // Mottled grey speckle
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = 100 + Math.random() * 60;
    const a = 0.15 + Math.random() * 0.25;
    ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${a})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Faint darker patches for cracks/seams
  ctx.strokeStyle = "rgba(40, 40, 40, 0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const x0 = Math.random() * size;
    const y0 = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.random() * 30 - 15, y0 + Math.random() * 30 - 15);
    ctx.stroke();
  }

  // Control joint lines (square grid every 128px)
  ctx.strokeStyle = "rgba(20, 20, 20, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(size, 128);
  ctx.moveTo(128, 0);
  ctx.lineTo(128, size);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface FloorStyle {
  texture: THREE.CanvasTexture;
  roughness: number;
  metalness: number;
  /** UV repeat density per world unit */
  repeatPerUnit: number;
}

const STYLES: Record<FloorMaterial, () => FloorStyle> = {
  "parquet-warm": () => ({
    texture: makeParquetWarm(),
    roughness: 0.7,
    metalness: 0.05,
    repeatPerUnit: 0.35,
  }),
  "epoxy-blue": () => ({
    texture: makeEpoxyBlue(),
    roughness: 0.35,
    metalness: 0.25,
    repeatPerUnit: 0.4,
  }),
  "carpet-gray": () => ({
    texture: makeCarpetGray(),
    roughness: 0.95,
    metalness: 0.0,
    repeatPerUnit: 0.6,
  }),
  concrete: () => ({
    texture: makeConcrete(),
    roughness: 0.85,
    metalness: 0.05,
    repeatPerUnit: 0.4,
  }),
};

/** Build a floor style for the given material id */
export function buildFloorStyle(material: FloorMaterial): FloorStyle {
  return STYLES[material]();
}
