/**
 * TechLab — engineering dept dressing for the Tech Lab room
 * (xMin=-3, xMax=15, zMin=-1, zMax=9). Pieces:
 *   - Whiteboard on back wall
 *   - Kanban board (3-column post-it board)
 *   - Server rack with blinking LEDs
 *   - Wall-mounted flat TV showing dashboard
 *
 * The two shared desks ("tech" + "tech-lab") are still rendered by
 * SharedDesk in OfficeFurniture. This file only adds room dressing.
 */
import * as THREE from "three";
import { getRoom } from "../officeRooms";

const ROOM = getRoom("tech-lab");
const CX = (ROOM.bounds.xMin + ROOM.bounds.xMax) / 2; // 6
const CZ = (ROOM.bounds.zMin + ROOM.bounds.zMax) / 2; // 4

export function TechLab() {
  return (
    <group>
      <Whiteboard />
      <KanbanBoard />
      <ServerRack position={[ROOM.bounds.xMax - 1, 0, ROOM.bounds.zMax - 1.2]} />
      <DashboardTV position={[CX - 3, 2.2, ROOM.bounds.zMax - 0.5]} />
      <FloorAccentStrip />
    </group>
  );
}

/** Large whiteboard on the horizontal wall at z=-1 (top boundary) */
function Whiteboard() {
  const x = CX + 3;
  const y = 2.0;
  const z = -0.7;
  return (
    <group position={[x, y, z]}>
      {/* Frame */}
      <mesh castShadow>
        <boxGeometry args={[4.2, 2.2, 0.08]} />
        <meshStandardMaterial color="#c0c0c4" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* White surface */}
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[4.0, 2.0, 0.02]} />
        <meshStandardMaterial
          color="#f4f4f8"
          emissive="#f4f4f8"
          emissiveIntensity={0.08}
          roughness={0.25}
        />
      </mesh>
      {/* Marker tray */}
      <mesh position={[0, -1.05, 0.1]} castShadow>
        <boxGeometry args={[2.5, 0.08, 0.12]} />
        <meshStandardMaterial color="#c0c0c4" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Markers in the tray */}
      {[
        { x: -0.6, c: "#e83a78" },
        { x: -0.3, c: "#3ad4d4" },
        { x: 0, c: "#1a1a1a" },
        { x: 0.3, c: "#60a5fa" },
      ].map((m, i) => (
        <mesh key={i} position={[m.x, -1.0, 0.14]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.14, 8]} />
          <meshStandardMaterial color={m.c} roughness={0.4} />
        </mesh>
      ))}
      {/* Scribble marks — sparse line representations */}
      {[
        { x: -1.2, y: 0.5, w: 1.8, c: "#60a5fa" },
        { x: 0.5, y: 0.3, w: 1.5, c: "#1a1a1a" },
        { x: -0.8, y: -0.1, w: 2.2, c: "#e83a78" },
        { x: 0.2, y: -0.5, w: 1.4, c: "#1a1a1a" },
      ].map((line, i) => (
        <mesh key={`l${i}`} position={[line.x + line.w / 2, line.y, 0.065]}>
          <boxGeometry args={[line.w, 0.025, 0.003]} />
          <meshStandardMaterial color={line.c} roughness={0.5} opacity={0.5} transparent />
        </mesh>
      ))}
    </group>
  );
}

/** Kanban board — 3 column "To Do / Doing / Done" with post-it cards */
function KanbanBoard() {
  const x = CX - 4;
  const y = 2.0;
  const z = -0.7;
  const colW = 1.1;

  const columns = [
    { label: "TODO", cards: ["#fff196", "#ffd1e0", "#b0e8ff"] },
    { label: "DOING", cards: ["#d0f5c0", "#fff196"] },
    { label: "DONE", cards: ["#b0e8ff", "#d0f5c0", "#ffd1e0", "#fff196"] },
  ];

  return (
    <group position={[x, y, z]}>
      {/* Board background */}
      <mesh castShadow>
        <boxGeometry args={[3.8, 2.2, 0.06]} />
        <meshStandardMaterial color="#2a5a3a" roughness={0.85} />
      </mesh>
      {/* Column dividers */}
      {[1, 2].map((i) => (
        <mesh key={i} position={[-1.9 + i * colW + (i - 1) * 0.17, 0, 0.04]}>
          <boxGeometry args={[0.02, 2.0, 0.01]} />
          <meshStandardMaterial color="#1a3a22" roughness={0.8} />
        </mesh>
      ))}
      {/* Column labels */}
      {columns.map((col, ci) => (
        <group key={ci}>
          {/* Label bar */}
          <mesh position={[-1.25 + ci * 1.26, 0.85, 0.04]}>
            <boxGeometry args={[1.0, 0.18, 0.01]} />
            <meshStandardMaterial color="#1a3a22" roughness={0.8} />
          </mesh>
          {/* Cards */}
          {col.cards.map((cardColor, ri) => (
            <mesh
              key={`${ci}_${ri}`}
              position={[-1.25 + ci * 1.26, 0.5 - ri * 0.42, 0.05]}
              rotation={[0, 0, ((ci * 3 + ri) % 5 - 2) * 0.03]}
            >
              <boxGeometry args={[0.8, 0.32, 0.012]} />
              <meshStandardMaterial
                color={cardColor}
                emissive={cardColor}
                emissiveIntensity={0.12}
                roughness={0.7}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Server rack with LED indicator strips */
function ServerRack({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Main body */}
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 2.2, 0.55]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Front panel lines (rack units) */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} position={[0, 0.3 + i * 0.25, 0.28]}>
          <boxGeometry args={[0.6, 0.18, 0.02]} />
          <meshStandardMaterial color="#2a2a30" roughness={0.5} metalness={0.4} />
        </mesh>
      ))}
      {/* LED strips — emissive vertical bars */}
      {[
        { x: -0.28, c: "#3ad4d4" },
        { x: -0.2, c: "#60a5fa" },
        { x: 0.2, c: "#34d399" },
        { x: 0.28, c: "#3ad4d4" },
      ].map((led, i) => (
        <mesh key={`led${i}`} position={[led.x, 1.1, 0.29]}>
          <boxGeometry args={[0.02, 1.6, 0.005]} />
          <meshStandardMaterial
            color={led.c}
            emissive={led.c}
            emissiveIntensity={1.2}
            roughness={0.2}
          />
        </mesh>
      ))}
      {/* Status dots on front panels */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={`dot${i}`} position={[0.25, 0.3 + i * 0.25, 0.3]}>
          <sphereGeometry args={[0.015, 6, 6]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? "#fbbf24" : "#34d399"}
            emissive={i % 3 === 0 ? "#fbbf24" : "#34d399"}
            emissiveIntensity={1.5}
            roughness={0.2}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Wall-mounted flat TV showing a dashboard-like glow — rotated 180° to
 *  face INTO the room from the front (z=+9) wall. */
function DashboardTV({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, Math.PI, 0]}>
      {/* Bezel */}
      <mesh castShadow>
        <boxGeometry args={[2.4, 1.4, 0.06]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 0, 0.04]}>
        <boxGeometry args={[2.2, 1.2, 0.02]} />
        <meshStandardMaterial
          color="#0a1428"
          emissive="#1a3858"
          emissiveIntensity={0.8}
          roughness={0.3}
        />
      </mesh>
      {/* Dashboard chart bars */}
      {[
        { x: -0.7, h: 0.3, c: "#60a5fa" },
        { x: -0.45, h: 0.5, c: "#60a5fa" },
        { x: -0.2, h: 0.35, c: "#60a5fa" },
        { x: 0.05, h: 0.65, c: "#34d399" },
        { x: 0.3, h: 0.45, c: "#34d399" },
        { x: 0.55, h: 0.55, c: "#34d399" },
      ].map((bar, i) => (
        <mesh key={i} position={[bar.x, -0.3 + bar.h / 2, 0.055]}>
          <boxGeometry args={[0.18, bar.h, 0.005]} />
          <meshStandardMaterial
            color={bar.c}
            emissive={bar.c}
            emissiveIntensity={0.6}
            roughness={0.3}
          />
        </mesh>
      ))}
      {/* Title bar */}
      <mesh position={[0, 0.45, 0.055]}>
        <boxGeometry args={[1.8, 0.08, 0.003]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.3}
          roughness={0.3}
          transparent
          opacity={0.6}
        />
      </mesh>
    </group>
  );
}

/** Subtle epoxy floor accent — glowing blue strip along the room center */
function FloorAccentStrip() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CX, 0.004, CZ]}>
      <planeGeometry args={[16, 0.06]} />
      <meshStandardMaterial
        color="#60a5fa"
        emissive="#60a5fa"
        emissiveIntensity={0.4}
        roughness={0.3}
      />
    </mesh>
  );
}
