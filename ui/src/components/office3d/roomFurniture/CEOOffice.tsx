/**
 * CEOOffice — executive room dressing for the CEO Office (xMin=-15, xMax=-7,
 * zMin=-9, zMax=-1). Pieces:
 *   - Persian rug under the desk area
 *   - Bookshelf against the back wall
 *   - Globe on a brass stand
 *   - Big framed wall art
 *   - Two Chesterfield armchairs facing the desk
 *
 * The CEO desk itself + the brass lamp are still rendered by the shared
 * SharedDesk + CEOLamp components in OfficeFurniture (which already lives
 * in the right spot). This file only adds the room-specific dressing.
 */
import * as THREE from "three";
import { getRoom } from "../officeRooms";

const ROOM = getRoom("ceo-office");
const CX = (ROOM.bounds.xMin + ROOM.bounds.xMax) / 2; // -11
const CZ = (ROOM.bounds.zMin + ROOM.bounds.zMax) / 2; // -5

export function CEOOffice() {
  return (
    <group>
      <PersianRug />
      <BookshelfBack />
      <Globe position={[CX + 2.5, 0, CZ - 2.5]} />
      <BigWallArt />
      <Chesterfield position={[CX - 2.5, 0, CZ + 1.4]} rotationY={Math.PI * 0.6} />
      <Chesterfield position={[CX + 1.5, 0, CZ + 1.4]} rotationY={-Math.PI * 0.6} />
      <WallClock3D position={[ROOM.bounds.xMin + 0.15, 2.8, CZ]} />
      <CeoPottedPlant position={[ROOM.bounds.xMin + 1, 0, ROOM.bounds.zMax - 1.5]} />
      <CoatRack position={[ROOM.bounds.xMax - 1, 0, ROOM.bounds.zMax - 0.8]} />
      <DeskLamp position={[-10.2, 0.89, -5.5]} />
    </group>
  );
}

/** Warm-toned plane with a stylised geometric pattern */
function PersianRug() {
  return (
    <group>
      {/* Main rug body */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, 0.005, CZ]}
        receiveShadow
      >
        <planeGeometry args={[5, 4]} />
        <meshStandardMaterial color="#8a3a28" roughness={0.92} />
      </mesh>
      {/* Inner panel */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, 0.006, CZ]}
        receiveShadow
      >
        <planeGeometry args={[4.2, 3.2]} />
        <meshStandardMaterial color="#a04a30" roughness={0.92} />
      </mesh>
      {/* Center medallion */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, 0.007, CZ]}
        receiveShadow
      >
        <planeGeometry args={[1.6, 1.0]} />
        <meshStandardMaterial color="#3a2218" roughness={0.92} />
      </mesh>
      {/* Border accent strips */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, 0.0065, CZ - 1.7]}
        receiveShadow
      >
        <planeGeometry args={[4.6, 0.18]} />
        <meshStandardMaterial color="#4a1a10" roughness={0.92} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, 0.0065, CZ + 1.7]}
        receiveShadow
      >
        <planeGeometry args={[4.6, 0.18]} />
        <meshStandardMaterial color="#4a1a10" roughness={0.92} />
      </mesh>
    </group>
  );
}

/** Tall bookshelf flush against the back wall (z=-9) */
function BookshelfBack() {
  const baseX = CX + 2.6; // toward the right side of the office
  const baseZ = -8.65;
  return (
    <group position={[baseX, 0, baseZ]}>
      {/* Back panel */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[1.8, 3.0, 0.1]} />
        <meshStandardMaterial color="#4a2c18" roughness={0.7} />
      </mesh>
      {/* Side panels */}
      <mesh position={[-0.85, 1.5, 0.18]} castShadow>
        <boxGeometry args={[0.06, 3.0, 0.4]} />
        <meshStandardMaterial color="#3a2010" roughness={0.7} />
      </mesh>
      <mesh position={[0.85, 1.5, 0.18]} castShadow>
        <boxGeometry args={[0.06, 3.0, 0.4]} />
        <meshStandardMaterial color="#3a2010" roughness={0.7} />
      </mesh>
      {/* Shelves */}
      {[0.35, 0.95, 1.55, 2.15, 2.75].map((y, i) => (
        <mesh key={i} position={[0, y, 0.18]} castShadow receiveShadow>
          <boxGeometry args={[1.7, 0.05, 0.4]} />
          <meshStandardMaterial color="#5a3820" roughness={0.7} />
        </mesh>
      ))}
      {/* Books — colored upright rectangles on each shelf */}
      {[
        { y: 0.62, colors: ["#8a3a3a", "#3a5a8a", "#8a6a3a", "#4a6a4a", "#7a3a7a", "#3a3a7a"] },
        { y: 1.22, colors: ["#7a5a3a", "#5a8a5a", "#8a4a4a", "#4a4a8a", "#8a7a3a", "#6a3a6a"] },
        { y: 1.82, colors: ["#3a5a8a", "#8a3a5a", "#4a8a3a", "#8a8a3a", "#3a8a8a", "#5a3a8a"] },
        { y: 2.42, colors: ["#7a4a4a", "#4a7a4a", "#4a4a7a", "#7a7a4a", "#4a7a7a", "#7a4a7a"] },
      ].flatMap((row) =>
        row.colors.map((c, i) => (
          <mesh
            key={`b${row.y}_${i}`}
            position={[-0.65 + i * 0.22, row.y, 0.18]}
            castShadow
          >
            <boxGeometry args={[0.18, 0.42, 0.18]} />
            <meshStandardMaterial color={c} roughness={0.6} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Brass-stand globe on a column */
function Globe({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Wooden plinth */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.22, 0.8, 12]} />
        <meshStandardMaterial color="#3a2010" roughness={0.7} />
      </mesh>
      {/* Brass ring base */}
      <mesh position={[0, 0.82, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.04, 16]} />
        <meshStandardMaterial color="#b8923a" roughness={0.3} metalness={0.85} />
      </mesh>
      {/* Brass arc */}
      <mesh position={[0, 1.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.32, 0.018, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#b8923a" roughness={0.3} metalness={0.85} />
      </mesh>
      {/* Globe sphere */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <sphereGeometry args={[0.28, 20, 14]} />
        <meshStandardMaterial color="#2a4a78" roughness={0.55} />
      </mesh>
      {/* Continent stripe — fake green band */}
      <mesh position={[0, 1.18, 0]}>
        <sphereGeometry
          args={[0.282, 20, 14, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.3]}
        />
        <meshStandardMaterial
          color="#3d7a3c"
          roughness={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/** Large framed wall art — central focal piece on back wall */
function BigWallArt() {
  const x = CX - 2.5; // left side of back wall
  const y = 2.2;
  const z = -8.92;
  const w = 2.2;
  const h = 1.5;
  return (
    <group position={[x, y, z]}>
      {/* Frame */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[w + 0.14, h + 0.14, 0.06]} />
        <meshStandardMaterial color="#2a1810" roughness={0.7} />
      </mesh>
      {/* Canvas */}
      <mesh position={[0, 0, 0.04]}>
        <boxGeometry args={[w, h, 0.02]} />
        <meshStandardMaterial
          color="#8a4a2c"
          emissive="#8a4a2c"
          emissiveIntensity={0.18}
          roughness={0.6}
        />
      </mesh>
      {/* Abstract horizon strip */}
      <mesh position={[0, -0.2, 0.05]}>
        <boxGeometry args={[w * 0.95, 0.18, 0.005]} />
        <meshStandardMaterial color="#d4a060" roughness={0.5} />
      </mesh>
      {/* Sun disc */}
      <mesh position={[w * 0.18, 0.05, 0.05]}>
        <cylinderGeometry args={[0.16, 0.16, 0.005, 18]} />
        <meshStandardMaterial
          color="#ffd070"
          emissive="#ffd070"
          emissiveIntensity={0.4}
          roughness={0.4}
        />
      </mesh>
    </group>
  );
}

/** Tufted Chesterfield-style armchair — low-poly */
function Chesterfield({
  position,
  rotationY,
}: {
  position: [number, number, number];
  rotationY: number;
}) {
  const leather = "#5a2a18";
  const leatherDark = "#3a1808";
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Base cushion */}
      <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.95, 0.25, 0.85]} />
        <meshStandardMaterial color={leather} roughness={0.6} />
      </mesh>
      {/* Seat cushion (lighter) */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.85, 0.12, 0.75]} />
        <meshStandardMaterial color="#7a3a22" roughness={0.55} />
      </mesh>
      {/* Backrest with rolled top */}
      <mesh position={[0, 0.85, -0.35]} castShadow>
        <boxGeometry args={[0.95, 0.7, 0.18]} />
        <meshStandardMaterial color={leather} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.2, -0.32]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.95, 10]} />
        <meshStandardMaterial color={leather} roughness={0.55} />
      </mesh>
      {/* Tufting buttons (small dark dots) */}
      {[
        [-0.25, 0.85, -0.26],
        [0.25, 0.85, -0.26],
        [0, 0.7, -0.26],
        [-0.25, 0.55, -0.26],
        [0.25, 0.55, -0.26],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <sphereGeometry args={[0.025, 6, 6]} />
          <meshStandardMaterial color={leatherDark} roughness={0.6} />
        </mesh>
      ))}
      {/* Armrests with rolled top */}
      <mesh position={[-0.5, 0.6, 0]} castShadow>
        <boxGeometry args={[0.18, 0.5, 0.85]} />
        <meshStandardMaterial color={leather} roughness={0.6} />
      </mesh>
      <mesh position={[0.5, 0.6, 0]} castShadow>
        <boxGeometry args={[0.18, 0.5, 0.85]} />
        <meshStandardMaterial color={leather} roughness={0.6} />
      </mesh>
      <mesh
        position={[-0.5, 0.85, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.09, 0.09, 0.85, 8]} />
        <meshStandardMaterial color={leather} roughness={0.55} />
      </mesh>
      <mesh
        position={[0.5, 0.85, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.09, 0.09, 0.85, 8]} />
        <meshStandardMaterial color={leather} roughness={0.55} />
      </mesh>
      {/* Short legs */}
      {[
        [-0.4, 0.1, -0.35],
        [0.4, 0.1, -0.35],
        [-0.4, 0.1, 0.35],
        [0.4, 0.1, 0.35],
      ].map((p, i) => (
        <mesh key={`leg${i}`} position={p as [number, number, number]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.2, 8]} />
          <meshStandardMaterial color="#1a0e06" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/** 3D wall clock — brass rim + white face, mounted on left wall facing +X */
function WallClock3D({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      {/* Rim */}
      <mesh>
        <torusGeometry args={[0.28, 0.025, 8, 24]} />
        <meshStandardMaterial color="#b8923a" roughness={0.3} metalness={0.85} />
      </mesh>
      {/* Face */}
      <mesh position={[0, 0, 0.01]}>
        <circleGeometry args={[0.27, 24]} />
        <meshStandardMaterial color="#f8f4e8" roughness={0.6} />
      </mesh>
      {/* Hour markers — 12 small dots */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / 12 - Math.PI / 2;
        const r = 0.22;
        return (
          <mesh key={i} position={[Math.cos(angle) * r, Math.sin(angle) * r, 0.02]}>
            <sphereGeometry args={[0.015, 4, 4]} />
            <meshStandardMaterial color="#2a1810" roughness={0.5} />
          </mesh>
        );
      })}
      {/* Hour hand */}
      <mesh position={[0.04, 0.04, 0.02]} rotation={[0, 0, -Math.PI * 0.35]}>
        <boxGeometry args={[0.12, 0.018, 0.008]} />
        <meshStandardMaterial color="#2a1810" roughness={0.5} />
      </mesh>
      {/* Minute hand */}
      <mesh position={[0, 0.06, 0.025]} rotation={[0, 0, Math.PI * 0.15]}>
        <boxGeometry args={[0.17, 0.012, 0.006]} />
        <meshStandardMaterial color="#2a1810" roughness={0.5} />
      </mesh>
      {/* Center pin */}
      <mesh position={[0, 0, 0.03]}>
        <sphereGeometry args={[0.018, 6, 6]} />
        <meshStandardMaterial color="#b8923a" roughness={0.3} metalness={0.85} />
      </mesh>
    </group>
  );
}

/** Small elegant potted plant for the CEO office */
function CeoPottedPlant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.2, 0.44, 10]} />
        <meshStandardMaterial color="#a04020" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[0.23, 0.23, 0.02, 10]} />
        <meshStandardMaterial color="#3a1f0e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 0.3, 6]} />
        <meshStandardMaterial color="#3a1810" />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <sphereGeometry args={[0.3, 10, 8]} />
        <meshStandardMaterial color="#3d7a3c" roughness={0.85} />
      </mesh>
      <mesh position={[0.15, 0.78, 0.1]} castShadow>
        <sphereGeometry args={[0.2, 10, 8]} />
        <meshStandardMaterial color="#4a8a48" roughness={0.85} />
      </mesh>
      <mesh position={[-0.1, 0.8, -0.08]} castShadow>
        <sphereGeometry args={[0.17, 10, 8]} />
        <meshStandardMaterial color="#336633" roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Wooden coat rack near the door */
function CoatRack({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.25, 0.04, 12]} />
        <meshStandardMaterial color="#3a2010" roughness={0.7} />
      </mesh>
      {/* Pole */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.035, 1.8, 8]} />
        <meshStandardMaterial color="#5a3820" roughness={0.7} />
      </mesh>
      {/* 4 hooks */}
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((a, i) => (
        <mesh key={i} position={[Math.sin(a) * 0.15, 1.7, Math.cos(a) * 0.15]} castShadow>
          <sphereGeometry args={[0.035, 6, 6]} />
          <meshStandardMaterial color="#b8923a" roughness={0.3} metalness={0.7} />
        </mesh>
      ))}
      {/* A hanging jacket (just a draped box shape) */}
      <mesh position={[0.15, 1.35, 0]} castShadow>
        <boxGeometry args={[0.25, 0.55, 0.12]} />
        <meshStandardMaterial color="#2a3340" roughness={0.7} />
      </mesh>
      {/* Top knob */}
      <mesh position={[0, 1.82, 0]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#5a3820" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Small brass desk lamp — emissive warm glow */
function DeskLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.07, 0.04, 10]} />
        <meshStandardMaterial color="#b8923a" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.3, 6]} />
        <meshStandardMaterial color="#b8923a" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.35, 0]} castShadow>
        <coneGeometry args={[0.1, 0.12, 12, 1, true]} />
        <meshStandardMaterial
          color="#d4a877"
          emissive="#fff4d6"
          emissiveIntensity={0.8}
          side={2}
        />
      </mesh>
    </group>
  );
}
