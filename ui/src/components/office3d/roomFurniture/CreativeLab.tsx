/**
 * CreativeLab — prototyping space dressing for the Creative Lab room
 * (xMin=5, xMax=15, zMin=-9, zMax=-1). Pieces:
 *   - Metal workbench (secondary work surface)
 *   - Stylised 3D printer
 *   - Component rack (grid of coloured bins)
 *   - Ceiling projector with cone light on floor
 *   - 2 tall stools
 *
 * The shared "creative-lab" desk is still rendered by SharedDesk in
 * OfficeFurniture; this file only adds room-specific dressing.
 */
import * as THREE from "three";
import { getRoom } from "../officeRooms";

const ROOM = getRoom("creative-lab");
const CX = (ROOM.bounds.xMin + ROOM.bounds.xMax) / 2; // 10
const CZ = (ROOM.bounds.zMin + ROOM.bounds.zMax) / 2; // -5

export function CreativeLab() {
  return (
    <group>
      <Workbench position={[CX + 3.5, 0, CZ - 2.5]} />
      <Printer3D position={[CX + 3.5, 0, CZ + 0.5]} />
      <ComponentRack position={[CX + 4.7, 0, CZ + 2.5]} />
      <CeilingProjector />
      <TallStool position={[CX + 2.2, 0, CZ - 2.5]} />
      <TallStool position={[CX + 2.2, 0, CZ - 1.3]} />
      {/* Concrete floor accent — control joint cross */}
      <FloorJointCross />
    </group>
  );
}

/** Heavy metal workbench with tool marks */
function Workbench({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Top — metal sheet */}
      <mesh position={[0, 0.92, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.05, 0.9]} />
        <meshStandardMaterial color="#8a8a90" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Under-shelf */}
      <mesh position={[0, 0.4, 0]} receiveShadow>
        <boxGeometry args={[1.7, 0.04, 0.8]} />
        <meshStandardMaterial color="#5a5a60" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* 4 steel legs */}
      {[
        [-0.8, 0.46, -0.38],
        [0.8, 0.46, -0.38],
        [-0.8, 0.46, 0.38],
        [0.8, 0.46, 0.38],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.06, 0.92, 0.06]} />
          <meshStandardMaterial color="#4a4a50" roughness={0.4} metalness={0.65} />
        </mesh>
      ))}
      {/* Vice grip on corner */}
      <mesh position={[-0.7, 0.98, 0.3]} castShadow>
        <boxGeometry args={[0.18, 0.12, 0.12]} />
        <meshStandardMaterial color="#3a3a40" roughness={0.35} metalness={0.7} />
      </mesh>
      {/* Scattered small parts on surface */}
      {[
        [0.2, 0.96, 0.15],
        [-0.3, 0.96, -0.1],
        [0.5, 0.96, -0.25],
      ].map((p, i) => (
        <mesh key={`part${i}`} position={p as [number, number, number]}>
          <boxGeometry args={[0.08, 0.04, 0.06]} />
          <meshStandardMaterial
            color={["#e83a78", "#fbbf24", "#3ad4d4"][i]}
            roughness={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Stylised 3D printer — box body with moving head hint */
function Printer3D({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Base platform */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.02, 0.5]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Frame uprights */}
      {[
        [-0.22, 0.72, -0.22],
        [0.22, 0.72, -0.22],
        [-0.22, 0.72, 0.22],
        [0.22, 0.72, 0.22],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.03, 0.55, 0.03]} />
          <meshStandardMaterial color="#4a4a50" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      {/* Top cross bars */}
      <mesh position={[0, 0.98, -0.22]}>
        <boxGeometry args={[0.44, 0.03, 0.03]} />
        <meshStandardMaterial color="#4a4a50" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.98, 0.22]}>
        <boxGeometry args={[0.44, 0.03, 0.03]} />
        <meshStandardMaterial color="#4a4a50" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Print head — small bright box */}
      <mesh position={[0.05, 0.85, 0]}>
        <boxGeometry args={[0.08, 0.06, 0.08]} />
        <meshStandardMaterial
          color="#e83a78"
          emissive="#e83a78"
          emissiveIntensity={0.5}
          roughness={0.3}
        />
      </mesh>
      {/* Build plate (slightly raised from base) */}
      <mesh position={[0, 0.48, 0]}>
        <boxGeometry args={[0.4, 0.02, 0.4]} />
        <meshStandardMaterial color="#6a6a70" roughness={0.35} metalness={0.5} />
      </mesh>
      {/* Small printed object hint */}
      <mesh position={[-0.06, 0.52, 0.04]} castShadow>
        <boxGeometry args={[0.12, 0.06, 0.1]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.5} />
      </mesh>
      {/* Table under printer */}
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.44, 0.6]} />
        <meshStandardMaterial color="#3a3a3e" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

/** Wall-mounted component rack — 4×3 grid of coloured bins */
function ComponentRack({ position }: { position: [number, number, number] }) {
  const binColors = [
    "#e83a78", "#fbbf24", "#3ad4d4", "#c084fc",
    "#60a5fa", "#34d399", "#f472b6", "#94a3b8",
    "#fbbf24", "#3ad4d4", "#e83a78", "#60a5fa",
  ];
  return (
    <group position={position}>
      {/* Back panel */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[0.12, 1.8, 1.4]} />
        <meshStandardMaterial color="#4a4a50" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Bins (4 rows × 3 cols) */}
      {Array.from({ length: 12 }).map((_, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const y = 0.55 + row * 0.42;
        const z = -0.45 + col * 0.45;
        return (
          <mesh key={i} position={[0.12, y, z]} castShadow>
            <boxGeometry args={[0.18, 0.32, 0.38]} />
            <meshStandardMaterial
              color={binColors[i]}
              roughness={0.6}
              emissive={binColors[i]}
              emissiveIntensity={0.08}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/** Ceiling-mounted projector with cone light on floor */
function CeilingProjector() {
  const px = CX - 1;
  const pz = CZ;
  return (
    <group>
      {/* Projector body */}
      <mesh position={[px, 3.6, pz]} castShadow>
        <boxGeometry args={[0.35, 0.2, 0.25]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Lens */}
      <mesh position={[px, 3.48, pz]}>
        <cylinderGeometry args={[0.06, 0.06, 0.04, 12]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.8}
          roughness={0.2}
        />
      </mesh>
      {/* Visible cone of light */}
      <mesh position={[px, 1.74, pz]}>
        <coneGeometry args={[1.2, 3.5, 16, 1, true]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.04}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Light spot on floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[px, 0.008, pz]}>
        <circleGeometry args={[1.2, 24]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.15}
          transparent
          opacity={0.3}
          roughness={0.9}
        />
      </mesh>
    </group>
  );
}

/** Industrial tall stool */
function TallStool({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Seat disc */}
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.06, 12]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Center pole */}
      <mesh position={[0, 0.38, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.75, 8]} />
        <meshStandardMaterial color="#4a4a50" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Footrest ring */}
      <mesh position={[0, 0.25, 0]}>
        <torusGeometry args={[0.16, 0.015, 6, 16]} />
        <meshStandardMaterial color="#4a4a50" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Base disc */}
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.04, 12]} />
        <meshStandardMaterial color="#3a3a3e" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  );
}

/** Decorative cross-shaped control joint on the concrete floor */
function FloorJointCross() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CX, 0.003, CZ]}>
        <planeGeometry args={[8, 0.04]} />
        <meshStandardMaterial color="#5a5a55" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CX, 0.003, CZ]}>
        <planeGeometry args={[0.04, 6]} />
        <meshStandardMaterial color="#5a5a55" roughness={0.9} />
      </mesh>
    </group>
  );
}
