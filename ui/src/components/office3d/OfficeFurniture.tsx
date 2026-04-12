/**
 * OfficeFurniture — orchestrates all furniture for the v12 multi-room office.
 *
 *   - SharedDesk renders each desk listed in DESKS (one per dept slot)
 *   - Per-room dressing components add the room-specific furniture
 *   - The Lounge couch/coffee table use the relocated RELAX positions
 *   - The CEO Lamp follows LIGHT_CEO_LAMP_POS (now inside CEO Office)
 *
 * Per-room dressing for Creative Lab, Tech Lab, and Lounge will be added
 * in S68b (v12 plan B.3-B.5).
 */
import { useMemo } from "react";
import * as THREE from "three";
import {
  DESKS,
  RELAX,
  LIGHT_CEO_LAMP_POS,
  buildSeatSlots,
  DEPT_COLORS,
} from "./officeLayout";

/** Desk label texture cache — small badge showing the desk name */
const deskLabelCache = new Map<string, THREE.CanvasTexture>();
function getDeskLabelTexture(label: string): THREE.CanvasTexture {
  const cached = deskLabelCache.get(label);
  if (cached) return cached;
  const w = 192;
  const h = 40;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  // Dark rounded pill
  ctx.fillStyle = "rgba(42, 24, 16, 0.85)";
  const r = 8;
  ctx.beginPath();
  ctx.moveTo(r, 2); ctx.lineTo(w - r, 2);
  ctx.quadraticCurveTo(w - 2, 2, w - 2, r + 2);
  ctx.lineTo(w - 2, h - r - 2);
  ctx.quadraticCurveTo(w - 2, h - 2, w - r, h - 2);
  ctx.lineTo(r, h - 2);
  ctx.quadraticCurveTo(2, h - 2, 2, h - r - 2);
  ctx.lineTo(2, r + 2);
  ctx.quadraticCurveTo(2, 2, r, 2);
  ctx.closePath();
  ctx.fill();
  // Text
  ctx.fillStyle = "#ffeac2";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true;
  deskLabelCache.set(label, tex);
  return tex;
}
import { CEOOffice } from "./roomFurniture/CEOOffice";
import { CreativeStudio } from "./roomFurniture/CreativeStudio";
import { CreativeLab } from "./roomFurniture/CreativeLab";
import { TechLab } from "./roomFurniture/TechLab";
import { Lounge } from "./roomFurniture/Lounge";
import { RDLab } from "./roomFurniture/RDLab";

const SEAT_FACING: Record<string, number[]> = (() => {
  const map: Record<string, number[]> = {};
  for (const s of buildSeatSlots()) {
    if (!map[s.deskId]) map[s.deskId] = [];
    map[s.deskId][s.seatIndex] = s.facing;
  }
  return map;
})();

export function OfficeFurniture() {
  return (
    <group>
      {/* All shared workstations */}
      {DESKS.map((d) => (
        <SharedDesk key={d.id} desk={d} />
      ))}

      {/* Per-room dressing — all 5 rooms */}
      <CEOOffice />
      <CreativeStudio />
      <CreativeLab />
      <TechLab />
      <Lounge />
      <RDLab />

      {/* Lounge: couch + coffee table at the new RELAX positions */}
      <Couch />
      <CoffeeTable />
      <LoungeRug />

      {/* CEO Office: brass lamp inside the office (position from layout) */}
      <CEOLamp />
    </group>
  );
}

/** Soft warm-toned rug under the couch in the Lounge */
function LoungeRug() {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[RELAX.couchPosition[0], 0.008, RELAX.couchPosition[2] + 0.6]}
      receiveShadow
    >
      <planeGeometry args={[3.6, 3.0]} />
      <meshStandardMaterial color="#9c5a3c" roughness={0.95} />
    </mesh>
  );
}

function SharedDesk({ desk }: { desk: typeof DESKS[number] }) {
  const isCEO = desk.id === "ceo";
  const deptColor = DEPT_COLORS[desk.id] ?? DEPT_COLORS.default;
  const topW = isCEO ? 2.0 : 3.6;
  const topD = isCEO ? 1.2 : 2.2;
  const topH = 0.08;
  const topY = 0.85;
  const legH = topY;
  const labelTex = useMemo(() => getDeskLabelTexture(desk.label), [desk.label]);

  return (
    <group position={desk.position} rotation={[0, desk.rotation, 0]}>
      {/* Desk label badge — floating above the desk */}
      <sprite position={[0, topY + 0.7, 0]} scale={[1.1, 0.22, 1]}>
        <spriteMaterial map={labelTex} transparent depthWrite={false} opacity={0.8} />
      </sprite>

      {/* Top */}
      <mesh position={[0, topY, 0]} castShadow receiveShadow>
        <boxGeometry args={[topW, topH, topD]} />
        <meshStandardMaterial
          color={isCEO ? "#5c3a1e" : "#8b5a2b"}
          roughness={0.5}
          metalness={0.1}
        />
      </mesh>
      {/* 4 legs */}
      {[
        [-topW / 2 + 0.1, legH / 2, -topD / 2 + 0.1],
        [topW / 2 - 0.1, legH / 2, -topD / 2 + 0.1],
        [-topW / 2 + 0.1, legH / 2, topD / 2 - 0.1],
        [topW / 2 - 0.1, legH / 2, topD / 2 - 0.1],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} castShadow>
          <boxGeometry args={[0.08, legH, 0.08]} />
          <meshStandardMaterial color="#2a1810" roughness={0.7} />
        </mesh>
      ))}

      {/* Chairs at each seat */}
      {desk.seats.map((seatPos, i) => {
        const lx = seatPos[0] - desk.position[0];
        const lz = seatPos[2] - desk.position[2];
        const facing = SEAT_FACING[desk.id]?.[i] ?? 0;
        return (
          <group key={i} position={[lx, 0, lz]} rotation={[0, facing, 0]}>
            <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.5, 0.08, 0.5]} />
              <meshStandardMaterial color="#3a2414" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.75, -0.22]} castShadow>
              <boxGeometry args={[0.5, 0.6, 0.06]} />
              <meshStandardMaterial color="#3a2414" roughness={0.7} />
            </mesh>
            {[
              [-0.22, 0.21, -0.22],
              [0.22, 0.21, -0.22],
              [-0.22, 0.21, 0.22],
              [0.22, 0.21, 0.22],
            ].map((p, j) => (
              <mesh key={j} position={p as [number, number, number]} castShadow>
                <boxGeometry args={[0.05, 0.42, 0.05]} />
                <meshStandardMaterial color="#1a0e06" />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* Monitors + clutter for each seat */}
      {desk.seats.map((seatPos, i) => {
        const slx = seatPos[0] - desk.position[0];
        const slz = seatPos[2] - desk.position[2];
        const dirX = -slx;
        const dirZ = -slz;
        const dist = Math.hypot(dirX, dirZ) || 1;
        const nx = dirX / dist;
        const nz = dirZ / dist;
        const perpX = -nz;
        const perpZ = nx;
        const mx = slx + nx * 0.8;
        const mz = slz + nz * 0.8;
        const angle = Math.atan2(-nx, -nz);
        return (
          <group key={`m${i}`}>
            <group
              position={[mx, topY + 0.04, mz]}
              rotation={[0, angle, 0]}
            >
              {/* Stand */}
              <mesh position={[0, 0.1, 0]} castShadow>
                <boxGeometry args={[0.1, 0.2, 0.1]} />
                <meshStandardMaterial color="#1a1a1a" />
              </mesh>
              {/* Screen */}
              <mesh position={[0, 0.4, 0]} castShadow>
                <boxGeometry args={[0.55, 0.35, 0.04]} />
                <meshStandardMaterial
                  color="#0a0a0a"
                  emissive={deptColor}
                  emissiveIntensity={0.6}
                />
              </mesh>
              {/* Bezel */}
              <mesh position={[0, 0.4, 0.021]}>
                <boxGeometry args={[0.58, 0.38, 0.005]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.6} />
              </mesh>
            </group>
            <DeskClutter
              seed={`${desk.id}:${i}`}
              deskTopY={topY + 0.04}
              seatLocal={[slx, slz]}
              forward={[nx, nz]}
              perp={[perpX, perpZ]}
            />
          </group>
        );
      })}
    </group>
  );
}

/** Deterministic 0-1 hash from a seed string. */
function seedHash(s: string, salt: number): number {
  let h = salt | 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

const MUG_COLORS = ["#f5f5f5", "#ddd", "#4a6a8a", "#8a4a4a", "#3a5a3a"];
const FOLDER_COLORS = ["#c8a878", "#a86848", "#888", "#6a8a9a", "#9a6a8a"];

function DeskClutter({
  seed,
  deskTopY,
  seatLocal,
  forward,
  perp,
}: {
  seed: string;
  deskTopY: number;
  seatLocal: [number, number];
  forward: [number, number];
  perp: [number, number];
}) {
  const choice = Math.floor(seedHash(seed, 1) * 6);
  const objChoice = Math.floor(seedHash(seed, 7) * 6);
  const slotPairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ];
  const objPairs: Array<[string, string]> = [
    ["mug", "laptop"],
    ["mug", "folders"],
    ["mug", "postit"],
    ["laptop", "folders"],
    ["laptop", "postit"],
    ["folders", "postit"],
  ];
  const [sA, sB] = slotPairs[choice];
  const [oA, oB] = objPairs[objChoice];

  const slots = [
    { f: 0.6, p: -0.45 },
    { f: 0.6, p: 0.45 },
    { f: 1.05, p: -0.45 },
    { f: 1.05, p: 0.45 },
  ];
  const [slx, slz] = seatLocal;
  const [fx, fz] = forward;
  const [px, pz] = perp;

  const toWorld = (f: number, p: number): [number, number, number] => [
    slx + fx * f + px * p,
    deskTopY,
    slz + fz * f + pz * p,
  ];

  const rotA = seedHash(seed, 17) * Math.PI * 2;
  const rotB = seedHash(seed, 29) * Math.PI * 2;

  return (
    <group>
      <ClutterObject type={oA} pos={toWorld(slots[sA].f, slots[sA].p)} rotY={rotA} seed={seed + "A"} />
      <ClutterObject type={oB} pos={toWorld(slots[sB].f, slots[sB].p)} rotY={rotB} seed={seed + "B"} />
    </group>
  );
}

function ClutterObject({
  type,
  pos,
  rotY,
  seed,
}: {
  type: string;
  pos: [number, number, number];
  rotY: number;
  seed: string;
}) {
  if (type === "mug") {
    const color = MUG_COLORS[Math.floor(seedHash(seed, 3) * MUG_COLORS.length)];
    return (
      <group position={pos} rotation={[0, rotY, 0]}>
        <mesh position={[0, 0.055, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.04, 0.11, 14]} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.108, 0]}>
          <cylinderGeometry args={[0.038, 0.038, 0.002, 14]} />
          <meshStandardMaterial color="#2a1408" roughness={0.7} />
        </mesh>
        <mesh position={[0.048, 0.055, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.028, 0.008, 6, 10, Math.PI]} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
      </group>
    );
  }

  if (type === "laptop") {
    return (
      <group position={pos} rotation={[0, rotY, 0]}>
        <mesh position={[0, 0.015, 0]} castShadow>
          <boxGeometry args={[0.46, 0.025, 0.32]} />
          <meshStandardMaterial color="#2a2a2e" roughness={0.35} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.028, 0]}>
          <boxGeometry args={[0.08, 0.002, 0.08]} />
          <meshStandardMaterial color="#6a6a70" roughness={0.25} metalness={0.7} />
        </mesh>
      </group>
    );
  }

  if (type === "folders") {
    const c0 = FOLDER_COLORS[Math.floor(seedHash(seed, 5) * FOLDER_COLORS.length)];
    const c1 = FOLDER_COLORS[Math.floor(seedHash(seed, 11) * FOLDER_COLORS.length)];
    const c2 = FOLDER_COLORS[Math.floor(seedHash(seed, 13) * FOLDER_COLORS.length)];
    return (
      <group position={pos} rotation={[0, rotY, 0]}>
        <mesh position={[0, 0.012, 0]} rotation={[0, 0.08, 0]} castShadow>
          <boxGeometry args={[0.28, 0.018, 0.22]} />
          <meshStandardMaterial color={c0} roughness={0.85} />
        </mesh>
        <mesh position={[0.015, 0.031, -0.008]} rotation={[0, -0.05, 0]} castShadow>
          <boxGeometry args={[0.28, 0.018, 0.22]} />
          <meshStandardMaterial color={c1} roughness={0.85} />
        </mesh>
        <mesh position={[-0.01, 0.05, 0.012]} rotation={[0, 0.12, 0]} castShadow>
          <boxGeometry args={[0.28, 0.018, 0.22]} />
          <meshStandardMaterial color={c2} roughness={0.85} />
        </mesh>
      </group>
    );
  }

  // post-it
  const postitColors = ["#fff196", "#ffd1e0", "#b0e8ff", "#d0f5c0"];
  const col = postitColors[Math.floor(seedHash(seed, 19) * postitColors.length)];
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.1, 0.1]} />
        <meshStandardMaterial
          color={col}
          roughness={0.95}
          emissive={col}
          emissiveIntensity={0.12}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/** Curved couch — 5-segment arc approximation for a modern lounge feel */
function Couch() {
  const leather = "#7a4a3a";
  const cushion = "#8b5a4a";
  const segCount = 5;
  const arcRadius = 1.4;
  const arcSpan = Math.PI * 0.55; // ~100° arc
  const segW = 0.52;
  const segD = 0.9;

  return (
    <group position={RELAX.couchPosition} rotation={[0, RELAX.couchRotation, 0]}>
      {Array.from({ length: segCount }).map((_, i) => {
        const angle = -arcSpan / 2 + (arcSpan / (segCount - 1)) * i;
        const sx = Math.sin(angle) * arcRadius;
        const sz = Math.cos(angle) * arcRadius - arcRadius;
        return (
          <group key={i} position={[sx, 0, sz]} rotation={[0, -angle, 0]}>
            {/* Seat base */}
            <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
              <boxGeometry args={[segW, 0.3, segD]} />
              <meshStandardMaterial color={leather} roughness={0.85} />
            </mesh>
            {/* Cushion */}
            <mesh position={[0, 0.48, 0]} castShadow>
              <boxGeometry args={[segW - 0.04, 0.1, segD - 0.1]} />
              <meshStandardMaterial color={cushion} roughness={0.85} />
            </mesh>
            {/* Backrest */}
            <mesh position={[0, 0.68, -0.35]} castShadow>
              <boxGeometry args={[segW, 0.5, 0.18]} />
              <meshStandardMaterial color={leather} roughness={0.85} />
            </mesh>
          </group>
        );
      })}
      {/* Left armrest */}
      <group>
        {(() => {
          const a = -arcSpan / 2;
          const sx = Math.sin(a) * arcRadius;
          const sz = Math.cos(a) * arcRadius - arcRadius;
          return (
            <mesh position={[sx - 0.3, 0.55, sz]} rotation={[0, -a, 0]} castShadow>
              <boxGeometry args={[0.18, 0.4, segD]} />
              <meshStandardMaterial color="#6a3d2e" roughness={0.85} />
            </mesh>
          );
        })()}
      </group>
      {/* Right armrest */}
      <group>
        {(() => {
          const a = arcSpan / 2;
          const sx = Math.sin(a) * arcRadius;
          const sz = Math.cos(a) * arcRadius - arcRadius;
          return (
            <mesh position={[sx + 0.3, 0.55, sz]} rotation={[0, -a, 0]} castShadow>
              <boxGeometry args={[0.18, 0.4, segD]} />
              <meshStandardMaterial color="#6a3d2e" roughness={0.85} />
            </mesh>
          );
        })()}
      </group>
    </group>
  );
}

function CoffeeTable() {
  return (
    <group position={RELAX.coffeeTablePosition}>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.45, 0.45, 0.06, 16]} />
        <meshStandardMaterial color="#4a2c18" roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.17, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.35, 8]} />
        <meshStandardMaterial color="#2a1810" />
      </mesh>
      <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.04, 16]} />
        <meshStandardMaterial color="#2a1810" />
      </mesh>
      <mesh position={[0.15, 0.42, 0.1]} castShadow>
        <cylinderGeometry args={[0.06, 0.05, 0.1, 12]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>
    </group>
  );
}

function CEOLamp() {
  const [lx, , lz] = LIGHT_CEO_LAMP_POS;
  return (
    <group position={[lx, 0, lz]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 0.06, 12]} />
        <meshStandardMaterial color="#2a1810" />
      </mesh>
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.8, 8]} />
        <meshStandardMaterial color="#2a1810" />
      </mesh>
      <mesh position={[0, 1.75, 0]} castShadow>
        <coneGeometry args={[0.22, 0.3, 16, 1, true]} />
        <meshStandardMaterial
          color="#d4a877"
          emissive="#fff4d6"
          emissiveIntensity={0.6}
          side={2}
        />
      </mesh>
    </group>
  );
}
