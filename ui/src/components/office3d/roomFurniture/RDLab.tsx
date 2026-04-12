/**
 * RDLab — dedicated R&D Lab room dressing (xMin=-9, xMax=-3, zMin=-1, zMax=9).
 *
 * Pieces:
 *   - Research bookshelf against the back wall
 *   - Microscope on the desk
 *   - Stack of research journals
 *   - Whiteboard with equations
 *   - Lab bench with test tubes
 *   - Amber floor accent strip
 *   - 2 potted plants
 *
 * The shared "research" desk (4 seats) is rendered by SharedDesk in
 * OfficeFurniture. This file adds room-specific dressing.
 */
import * as THREE from "three";
import { getRoom } from "../officeRooms";

const ROOM = getRoom("rd-lab");
const CX = (ROOM.bounds.xMin + ROOM.bounds.xMax) / 2; // -6
const CZ = (ROOM.bounds.zMin + ROOM.bounds.zMax) / 2; // 4

export function RDLab() {
  return (
    <group>
      <ResearchBookshelf />
      <Microscope position={[CX - 0.8, 0.89, CZ - 1.3]} />
      <JournalStack position={[CX + 1.2, 0.89, CZ + 0.5]} />
      <EquationWhiteboard />
      <LabBench position={[CX + 2, 0, CZ + 3]} />
      <AmberFloorStrip />
      <SmallPlant position={[ROOM.bounds.xMin + 0.8, 0, ROOM.bounds.zMax - 1]} />
      <SmallPlant position={[ROOM.bounds.xMax - 0.8, 0, ROOM.bounds.zMin + 1]} scale={0.85} />
    </group>
  );
}

/** Tall bookshelf against the top wall (z=-1) */
function ResearchBookshelf() {
  const x = CX + 1.5;
  const z = -0.65;
  return (
    <group position={[x, 0, z]}>
      {/* Back panel */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[1.8, 2.4, 0.08]} />
        <meshStandardMaterial color="#4a2c18" roughness={0.7} />
      </mesh>
      {/* Side panels */}
      <mesh position={[-0.85, 1.2, 0.15]} castShadow>
        <boxGeometry args={[0.06, 2.4, 0.35]} />
        <meshStandardMaterial color="#3a2010" roughness={0.7} />
      </mesh>
      <mesh position={[0.85, 1.2, 0.15]} castShadow>
        <boxGeometry args={[0.06, 2.4, 0.35]} />
        <meshStandardMaterial color="#3a2010" roughness={0.7} />
      </mesh>
      {/* Shelves */}
      {[0.25, 0.75, 1.25, 1.75, 2.25].map((y, i) => (
        <mesh key={i} position={[0, y, 0.15]} castShadow receiveShadow>
          <boxGeometry args={[1.7, 0.04, 0.35]} />
          <meshStandardMaterial color="#5a3820" roughness={0.7} />
        </mesh>
      ))}
      {/* Books — research-colored */}
      {[
        { y: 0.48, colors: ["#fbbf24", "#3a5a8a", "#8a3a5a", "#4a8a3a", "#8a8a3a", "#3a8a8a"] },
        { y: 0.98, colors: ["#5a3a8a", "#8a6a3a", "#3a5a8a", "#7a4a4a", "#4a7a4a"] },
        { y: 1.48, colors: ["#fbbf24", "#8a3a3a", "#3a3a7a", "#7a7a3a", "#4a7a7a"] },
        { y: 1.98, colors: ["#8a4a2c", "#4a4a8a", "#8a7a3a", "#6a3a6a"] },
      ].flatMap((row) =>
        row.colors.map((c, i) => (
          <mesh
            key={`b${row.y}_${i}`}
            position={[-0.65 + i * 0.24, row.y, 0.15]}
            castShadow
          >
            <boxGeometry args={[0.18, 0.38, 0.2]} />
            <meshStandardMaterial color={c} roughness={0.6} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Microscope on the desk surface */
function Microscope({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Base plate */}
      <mesh position={[0, 0.02, 0]} castShadow>
        <boxGeometry args={[0.2, 0.04, 0.16]} />
        <meshStandardMaterial color="#2a2a30" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Arm/pillar */}
      <mesh position={[0, 0.24, -0.04]} castShadow>
        <boxGeometry args={[0.06, 0.44, 0.06]} />
        <meshStandardMaterial color="#2a2a30" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Eyepiece tube */}
      <mesh position={[0, 0.48, 0.02]} rotation={[Math.PI * 0.15, 0, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.22, 8]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Stage */}
      <mesh position={[0, 0.14, 0.03]}>
        <boxGeometry args={[0.12, 0.02, 0.12]} />
        <meshStandardMaterial color="#4a4a50" roughness={0.4} metalness={0.4} />
      </mesh>
      {/* Objective lenses (small cylinder cluster) */}
      <mesh position={[0, 0.28, 0.04]}>
        <cylinderGeometry args={[0.015, 0.015, 0.1, 6]} />
        <meshStandardMaterial color="#b8923a" roughness={0.3} metalness={0.7} />
      </mesh>
    </group>
  );
}

/** Stack of journals/papers */
function JournalStack({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[0, 0.022, 0.044, 0.066, 0.088].map((dy, i) => (
        <mesh key={i} position={[0, dy, 0]} rotation={[0, (i * 0.1) - 0.15, 0]} castShadow>
          <boxGeometry args={[0.32, 0.018, 0.22]} />
          <meshStandardMaterial
            color={["#f4ede0", "#e8dcc8", "#fbbf24", "#d4e8ff", "#e8d4ff"][i]}
            roughness={0.8}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Whiteboard with equation-like marks against the right wall (x=-3) */
function EquationWhiteboard() {
  const x = ROOM.bounds.xMax - 0.5;
  const y = 2.0;
  const z = CZ - 1;
  return (
    <group position={[x, y, z]} rotation={[0, -Math.PI / 2, 0]}>
      {/* Frame */}
      <mesh castShadow>
        <boxGeometry args={[2.8, 1.8, 0.06]} />
        <meshStandardMaterial color="#c0c0c4" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* White surface */}
      <mesh position={[0, 0, 0.04]}>
        <boxGeometry args={[2.6, 1.6, 0.02]} />
        <meshStandardMaterial
          color="#f4f4f8"
          emissive="#f4f4f8"
          emissiveIntensity={0.06}
          roughness={0.25}
        />
      </mesh>
      {/* Equation lines — dark marks */}
      {[
        { x: -0.6, y: 0.5, w: 1.2 },
        { x: 0.3, y: 0.25, w: 0.9 },
        { x: -0.4, y: 0, w: 1.5 },
        { x: 0.1, y: -0.25, w: 1.1 },
        { x: -0.7, y: -0.5, w: 1.4 },
      ].map((line, i) => (
        <mesh key={i} position={[line.x + line.w / 2, line.y, 0.055]}>
          <boxGeometry args={[line.w, 0.02, 0.003]} />
          <meshStandardMaterial color="#1a1a2e" roughness={0.5} opacity={0.4} transparent />
        </mesh>
      ))}
      {/* Marker tray */}
      <mesh position={[0, -0.85, 0.08]} castShadow>
        <boxGeometry args={[1.8, 0.06, 0.1]} />
        <meshStandardMaterial color="#c0c0c4" roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  );
}

/** Small lab bench with test tube rack */
function LabBench({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Table top — stainless steel */}
      <mesh position={[0, 0.88, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.05, 0.7]} />
        <meshStandardMaterial color="#8a8a90" roughness={0.35} metalness={0.6} />
      </mesh>
      {/* 4 legs */}
      {[[-0.6, 0.44, -0.28], [0.6, 0.44, -0.28], [-0.6, 0.44, 0.28], [0.6, 0.44, 0.28]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.06, 0.88, 0.06]} />
          <meshStandardMaterial color="#4a4a50" roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      {/* Test tube rack */}
      <group position={[-0.3, 0.91, 0]}>
        {/* Rack base */}
        <mesh position={[0, 0.03, 0]} castShadow>
          <boxGeometry args={[0.4, 0.04, 0.12]} />
          <meshStandardMaterial color="#5a3820" roughness={0.7} />
        </mesh>
        {/* Test tubes */}
        {[-0.14, -0.07, 0, 0.07, 0.14].map((tx, i) => (
          <mesh key={i} position={[tx, 0.12, 0]} castShadow>
            <cylinderGeometry args={[0.015, 0.015, 0.18, 6]} />
            <meshStandardMaterial
              color={["#a0d4f0", "#f0a0b0", "#a0f0c0", "#f0d0a0", "#d0a0f0"][i]}
              roughness={0.2}
              transparent
              opacity={0.7}
            />
          </mesh>
        ))}
      </group>
      {/* Beaker */}
      <mesh position={[0.35, 0.97, 0.1]} castShadow>
        <cylinderGeometry args={[0.05, 0.04, 0.12, 10]} />
        <meshStandardMaterial
          color="#a0d4f0"
          roughness={0.15}
          transparent
          opacity={0.5}
        />
      </mesh>
    </group>
  );
}

/** Amber floor accent strip — R&D identity */
function AmberFloorStrip() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CX, 0.004, CZ]}>
      <planeGeometry args={[4.5, 0.06]} />
      <meshStandardMaterial
        color="#fbbf24"
        emissive="#fbbf24"
        emissiveIntensity={0.4}
        roughness={0.3}
      />
    </mesh>
  );
}

/** Small potted plant */
function SmallPlant({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.16, 0.36, 10]} />
        <meshStandardMaterial color="#a04020" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.19, 0.19, 0.02, 10]} />
        <meshStandardMaterial color="#3a1f0e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.035, 0.25, 6]} />
        <meshStandardMaterial color="#3a1810" />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow>
        <sphereGeometry args={[0.22, 10, 8]} />
        <meshStandardMaterial color="#3d7a3c" roughness={0.85} />
      </mesh>
      <mesh position={[0.1, 0.65, 0.06]} castShadow>
        <sphereGeometry args={[0.14, 10, 8]} />
        <meshStandardMaterial color="#4a8a48" roughness={0.85} />
      </mesh>
    </group>
  );
}
