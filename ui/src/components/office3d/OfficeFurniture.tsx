/**
 * OfficeFurniture — all the low-poly desks, couch, CEO lamp, coffee table.
 * Stub for Gate 1 (room-only screenshot). Filled in Step 4.
 */
import {
  DESKS,
  RELAX,
  LIGHT_CEO_LAMP_POS,
  buildSeatSlots,
  DEPT_COLORS,
} from "./officeLayout";

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
      {DESKS.map((d) => (
        <SharedDesk key={d.id} desk={d} />
      ))}
      <Couch />
      <CoffeeTable />
      <CEOLamp />
      <RelaxCarpet />
      <PottedPlant position={[-7, 0, -5.5]} />
      <PottedPlant position={[6.5, 0, -5.5]} scale={0.85} />
      <WallArt position={[-5, 2, -5.88]} size={[1.6, 1.1]} tone="#8a4a2c" />
      <WallArt position={[0, 2.2, -5.88]} size={[1.4, 1.4]} tone="#4a6a8a" />
      <WallArt position={[3.5, 2, -5.88]} size={[1.2, 0.9]} tone="#a86a3a" />
      <Bookshelf position={[-7.88, 0, 2]} />
    </group>
  );
}

/** Soft warm-toned rectangular rug under the relax zone */
function RelaxCarpet() {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[4, 0.01, -3.8]}
      receiveShadow
    >
      <planeGeometry args={[3.4, 2.8]} />
      <meshStandardMaterial color="#9c5a3c" roughness={0.95} />
    </mesh>
  );
}

/** Potted plant: terracotta pot + green sphere foliage */
function PottedPlant({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      {/* Pot */}
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.28, 0.22, 0.4, 12]} />
        <meshStandardMaterial color="#a04020" roughness={0.8} />
      </mesh>
      {/* Dirt top */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.27, 0.27, 0.02, 12]} />
        <meshStandardMaterial color="#3a1f0e" roughness={0.9} />
      </mesh>
      {/* Trunk */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 0.4, 8]} />
        <meshStandardMaterial color="#3a1810" />
      </mesh>
      {/* Foliage — 3 overlapping spheres */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <sphereGeometry args={[0.38, 12, 10]} />
        <meshStandardMaterial color="#3d7a3c" roughness={0.85} />
      </mesh>
      <mesh position={[0.18, 0.85, 0.12]} castShadow>
        <sphereGeometry args={[0.28, 12, 10]} />
        <meshStandardMaterial color="#4a8a48" roughness={0.85} />
      </mesh>
      <mesh position={[-0.15, 0.92, -0.1]} castShadow>
        <sphereGeometry args={[0.25, 12, 10]} />
        <meshStandardMaterial color="#336633" roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Framed wall art: thin box with color + dark frame */
function WallArt({
  position,
  size,
  tone,
}: {
  position: [number, number, number];
  size: [number, number];
  tone: string;
}) {
  const [w, h] = size;
  return (
    <group position={position}>
      {/* Frame */}
      <mesh position={[0, 0, 0.02]} castShadow>
        <boxGeometry args={[w + 0.08, h + 0.08, 0.04]} />
        <meshStandardMaterial color="#2a1810" roughness={0.7} />
      </mesh>
      {/* Canvas */}
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[w, h, 0.02]} />
        <meshStandardMaterial
          color={tone}
          emissive={tone}
          emissiveIntensity={0.15}
          roughness={0.6}
        />
      </mesh>
    </group>
  );
}

/** Simple bookshelf against the left wall */
function Bookshelf({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Back panel */}
      <mesh position={[0.1, 1.3, 0]} castShadow>
        <boxGeometry args={[0.08, 2.6, 1.6]} />
        <meshStandardMaterial color="#4a2c18" roughness={0.7} />
      </mesh>
      {/* Shelves */}
      {[0.3, 0.95, 1.6, 2.25].map((y, i) => (
        <mesh key={i} position={[0.3, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.4, 0.05, 1.6]} />
          <meshStandardMaterial color="#5a3820" roughness={0.7} />
        </mesh>
      ))}
      {/* Books — colored rectangles on shelves */}
      {[
        { y: 0.55, color: "#8a3a3a" },
        { y: 0.55, color: "#3a5a8a", offset: 0.12 },
        { y: 0.55, color: "#8a6a3a", offset: 0.24 },
        { y: 0.55, color: "#4a6a4a", offset: 0.36 },
        { y: 0.55, color: "#7a3a7a", offset: 0.48 },
        { y: 1.2, color: "#3a3a7a" },
        { y: 1.2, color: "#7a5a3a", offset: 0.14 },
        { y: 1.2, color: "#5a8a5a", offset: 0.28 },
        { y: 1.2, color: "#8a4a4a", offset: 0.42 },
        { y: 1.85, color: "#4a4a8a" },
        { y: 1.85, color: "#8a7a3a", offset: 0.15 },
        { y: 1.85, color: "#6a3a6a", offset: 0.32 },
      ].map((b, i) => (
        <mesh
          key={`b${i}`}
          position={[0.35, b.y, -0.6 + (b.offset ?? 0)]}
          castShadow
        >
          <boxGeometry args={[0.24, 0.4, 0.1]} />
          <meshStandardMaterial color={b.color} roughness={0.6} />
        </mesh>
      ))}
    </group>
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

  return (
    <group position={desk.position} rotation={[0, desk.rotation, 0]}>
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

      {/* Chairs at each seat (rotated to face desk center) */}
      {desk.seats.map((seatPos, i) => {
        const lx = seatPos[0] - desk.position[0];
        const lz = seatPos[2] - desk.position[2];
        const facing = SEAT_FACING[desk.id]?.[i] ?? 0;
        return (
          <group key={i} position={[lx, 0, lz]} rotation={[0, facing, 0]}>
            {/* Chair seat */}
            <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.5, 0.08, 0.5]} />
              <meshStandardMaterial color="#3a2414" roughness={0.7} />
            </mesh>
            {/* Chair back — facing is handled by group rotation; back sits AWAY from desk */}
            <mesh position={[0, 0.75, -0.22]} castShadow>
              <boxGeometry args={[0.5, 0.6, 0.06]} />
              <meshStandardMaterial color="#3a2414" roughness={0.7} />
            </mesh>
            {/* Chair legs */}
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

      {/* Desk accessories: monitor for each seat, placed on the desk top
          in front of the agent (toward desk center from seat). */}
      {desk.seats.map((seatPos, i) => {
        const slx = seatPos[0] - desk.position[0];
        const slz = seatPos[2] - desk.position[2];
        // Direction from seat to desk center (in local coords, center is 0,0,0)
        const dirX = -slx;
        const dirZ = -slz;
        const dist = Math.hypot(dirX, dirZ) || 1;
        const nx = dirX / dist;
        const nz = dirZ / dist;
        // Place monitor 0.8 units from seat toward desk center (on desk top)
        const mx = slx + nx * 0.8;
        const mz = slz + nz * 0.8;
        const angle = Math.atan2(-nx, -nz); // monitor screen faces the seat
        return (
          <group
            key={`m${i}`}
            position={[mx, topY + 0.04, mz]}
            rotation={[0, angle, 0]}
          >
            {/* Stand */}
            <mesh position={[0, 0.1, 0]} castShadow>
              <boxGeometry args={[0.1, 0.2, 0.1]} />
              <meshStandardMaterial color="#1a1a1a" />
            </mesh>
            {/* Screen — glows with the department color */}
            <mesh position={[0, 0.4, 0]} castShadow>
              <boxGeometry args={[0.55, 0.35, 0.04]} />
              <meshStandardMaterial
                color="#0a0a0a"
                emissive={deptColor}
                emissiveIntensity={0.6}
              />
            </mesh>
            {/* Thin bezel around the screen for a bit of detail */}
            <mesh position={[0, 0.4, 0.021]}>
              <boxGeometry args={[0.58, 0.38, 0.005]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.6} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Couch() {
  return (
    <group position={RELAX.couchPosition} rotation={[0, RELAX.couchRotation, 0]}>
      {/* Base */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.35, 0.9]} />
        <meshStandardMaterial color="#7a4a3a" roughness={0.85} />
      </mesh>
      {/* Back */}
      <mesh position={[0, 0.7, 0.35]} castShadow>
        <boxGeometry args={[2.2, 0.6, 0.2]} />
        <meshStandardMaterial color="#7a4a3a" roughness={0.85} />
      </mesh>
      {/* Arms */}
      <mesh position={[-1.1, 0.55, 0]} castShadow>
        <boxGeometry args={[0.2, 0.4, 0.9]} />
        <meshStandardMaterial color="#6a3d2e" roughness={0.85} />
      </mesh>
      <mesh position={[1.1, 0.55, 0]} castShadow>
        <boxGeometry args={[0.2, 0.4, 0.9]} />
        <meshStandardMaterial color="#6a3d2e" roughness={0.85} />
      </mesh>
      {/* Cushion indicator */}
      <mesh position={[-0.55, 0.5, 0]} castShadow>
        <boxGeometry args={[1, 0.12, 0.8]} />
        <meshStandardMaterial color="#8b5a4a" roughness={0.85} />
      </mesh>
      <mesh position={[0.55, 0.5, 0]} castShadow>
        <boxGeometry args={[1, 0.12, 0.8]} />
        <meshStandardMaterial color="#8b5a4a" roughness={0.85} />
      </mesh>
    </group>
  );
}

function CoffeeTable() {
  return (
    <group position={RELAX.coffeeTablePosition}>
      {/* Top */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.45, 0.45, 0.06, 16]} />
        <meshStandardMaterial color="#4a2c18" roughness={0.5} metalness={0.15} />
      </mesh>
      {/* Central post */}
      <mesh position={[0, 0.17, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.35, 8]} />
        <meshStandardMaterial color="#2a1810" />
      </mesh>
      {/* Base */}
      <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.04, 16]} />
        <meshStandardMaterial color="#2a1810" />
      </mesh>
      {/* Coffee mug on top */}
      <mesh position={[0.15, 0.42, 0.1]} castShadow>
        <cylinderGeometry args={[0.06, 0.05, 0.1, 12]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>
    </group>
  );
}

function CEOLamp() {
  const [lx, ly, lz] = LIGHT_CEO_LAMP_POS;
  return (
    <group position={[lx, 0, lz]}>
      {/* Base on desk level */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 0.06, 12]} />
        <meshStandardMaterial color="#2a1810" />
      </mesh>
      {/* Pole */}
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.8, 8]} />
        <meshStandardMaterial color="#2a1810" />
      </mesh>
      {/* Shade — emissive to feel like it's glowing */}
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
