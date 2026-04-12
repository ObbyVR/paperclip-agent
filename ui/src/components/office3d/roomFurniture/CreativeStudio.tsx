/**
 * CreativeStudio — vibrant creative dept dressing for the Creative Studio
 * room (xMin=-7, xMax=5, zMin=-9, zMax=-1). Pieces:
 *   - Big moodboard panel on the back wall
 *   - Easel with canvas at the side
 *   - Glowing light table (lightbox)
 *   - 2 colored lounge chairs in the front corner
 *   - 2 oversized monstera plants
 *   - Geometric emissive rug
 *
 * The shared "creative" desk is still rendered by SharedDesk in
 * OfficeFurniture; this file only adds the room dressing.
 */
import * as THREE from "three";
import { getRoom } from "../officeRooms";

const ROOM = getRoom("creative-studio");
const CX = (ROOM.bounds.xMin + ROOM.bounds.xMax) / 2; // -1
const CZ = (ROOM.bounds.zMin + ROOM.bounds.zMax) / 2; // -5

export function CreativeStudio() {
  return (
    <group>
      <GeometricRug />
      <Moodboard />
      <Easel position={[CX + 4, 0, CZ + 1.5]} rotationY={-Math.PI * 0.4} />
      <LightTable position={[CX - 4.2, 0, CZ - 1.6]} />
      <LoungeChair position={[CX - 4.5, 0, CZ + 2.2]} color="#e83a78" rotationY={Math.PI * 0.25} />
      <LoungeChair position={[CX + 4.3, 0, CZ + 2.4]} color="#3ad4d4" rotationY={-Math.PI * 0.25} />
      <Monstera position={[CX - 5.4, 0, CZ - 3]} scale={1.1} />
      <Monstera position={[CX + 5.4, 0, CZ - 2.5]} scale={0.95} />
      <FireExtinguisher position={[ROOM.bounds.xMin + 0.5, 0, CZ + 2.5]} />
      <PaintSupplyTable position={[CX - 3, 0, CZ + 2]} />
    </group>
  );
}

/** Geometric pattern rug — emissive accents */
function GeometricRug() {
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, 0.005, CZ]}
        receiveShadow
      >
        <planeGeometry args={[5.5, 4]} />
        <meshStandardMaterial color="#1a1828" roughness={0.92} />
      </mesh>
      {/* Diagonal accent strip 1 */}
      <mesh
        rotation={[-Math.PI / 2, 0, Math.PI / 6]}
        position={[CX, 0.006, CZ]}
        receiveShadow
      >
        <planeGeometry args={[5, 0.45]} />
        <meshStandardMaterial
          color="#e83a78"
          emissive="#e83a78"
          emissiveIntensity={0.45}
          roughness={0.6}
        />
      </mesh>
      {/* Diagonal accent strip 2 */}
      <mesh
        rotation={[-Math.PI / 2, 0, -Math.PI / 6]}
        position={[CX, 0.0065, CZ]}
        receiveShadow
      >
        <planeGeometry args={[5, 0.35]} />
        <meshStandardMaterial
          color="#3ad4d4"
          emissive="#3ad4d4"
          emissiveIntensity={0.45}
          roughness={0.6}
        />
      </mesh>
      {/* Center triangle */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, 0.007, CZ]}
        receiveShadow
      >
        <planeGeometry args={[1.4, 1.4]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive="#fbbf24"
          emissiveIntensity={0.3}
          roughness={0.6}
        />
      </mesh>
    </group>
  );
}

/** Big colorful moodboard against the back wall */
function Moodboard() {
  const x = CX;
  const y = 2.0;
  const z = -8.92;
  return (
    <group position={[x, y, z]}>
      {/* Main board (cork-color) */}
      <mesh castShadow>
        <boxGeometry args={[5.6, 2.4, 0.06]} />
        <meshStandardMaterial color="#a87a52" roughness={0.85} />
      </mesh>
      {/* Frame */}
      <mesh position={[0, 0, -0.01]} castShadow>
        <boxGeometry args={[5.8, 2.6, 0.08]} />
        <meshStandardMaterial color="#3a2010" roughness={0.7} />
      </mesh>
      {/* Sticker grid — random colored notes pinned to the board */}
      {[
        { x: -2.3, y: 0.7, c: "#fff196", w: 0.55, h: 0.45 },
        { x: -1.5, y: 0.5, c: "#ffd1e0", w: 0.6, h: 0.4 },
        { x: -0.7, y: 0.7, c: "#b0e8ff", w: 0.5, h: 0.5 },
        { x: 0.1, y: 0.6, c: "#d0f5c0", w: 0.55, h: 0.4 },
        { x: 0.95, y: 0.7, c: "#fbbf24", w: 0.5, h: 0.5 },
        { x: 1.85, y: 0.6, c: "#c084fc", w: 0.55, h: 0.4 },
        { x: -2.3, y: -0.2, c: "#3ad4d4", w: 0.6, h: 0.45 },
        { x: -1.4, y: -0.3, c: "#fff196", w: 0.5, h: 0.4 },
        { x: -0.5, y: -0.2, c: "#e83a78", w: 0.55, h: 0.5 },
        { x: 0.4, y: -0.3, c: "#b0e8ff", w: 0.5, h: 0.4 },
        { x: 1.3, y: -0.2, c: "#fbbf24", w: 0.55, h: 0.45 },
        { x: 2.2, y: -0.3, c: "#d0f5c0", w: 0.5, h: 0.5 },
        { x: -2.0, y: -0.95, c: "#ffd1e0", w: 0.6, h: 0.45 },
        { x: -0.8, y: -0.95, c: "#fff196", w: 0.65, h: 0.4 },
        { x: 0.5, y: -0.95, c: "#3ad4d4", w: 0.5, h: 0.5 },
        { x: 1.7, y: -0.95, c: "#c084fc", w: 0.55, h: 0.4 },
      ].map((s, i) => (
        <mesh key={i} position={[s.x, s.y, 0.04]} rotation={[0, 0, ((i * 17) % 10 - 5) * 0.04]}>
          <boxGeometry args={[s.w, s.h, 0.012]} />
          <meshStandardMaterial
            color={s.c}
            emissive={s.c}
            emissiveIntensity={0.18}
            roughness={0.7}
          />
        </mesh>
      ))}
      {/* Pin dots in corners of selected stickers */}
      {[
        [-2.3, 0.88],
        [-0.7, 0.9],
        [0.95, 0.9],
        [-2.3, 0.0],
        [0.4, -0.1],
        [2.2, -0.1],
        [-2.0, -0.75],
        [0.5, -0.75],
      ].map(([px, py], i) => (
        <mesh key={`p${i}`} position={[px, py, 0.06]}>
          <sphereGeometry args={[0.025, 6, 6]} />
          <meshStandardMaterial color="#e83a78" roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** A-frame easel with white canvas */
function Easel({
  position,
  rotationY,
}: {
  position: [number, number, number];
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Back leg */}
      <mesh position={[0, 0.85, -0.18]} rotation={[Math.PI * 0.05, 0, 0]} castShadow>
        <boxGeometry args={[0.06, 1.7, 0.06]} />
        <meshStandardMaterial color="#5a3820" roughness={0.7} />
      </mesh>
      {/* Front legs (V shape) */}
      <mesh
        position={[-0.15, 0.85, 0.1]}
        rotation={[-Math.PI * 0.06, 0, Math.PI * 0.04]}
        castShadow
      >
        <boxGeometry args={[0.06, 1.7, 0.06]} />
        <meshStandardMaterial color="#5a3820" roughness={0.7} />
      </mesh>
      <mesh
        position={[0.15, 0.85, 0.1]}
        rotation={[-Math.PI * 0.06, 0, -Math.PI * 0.04]}
        castShadow
      >
        <boxGeometry args={[0.06, 1.7, 0.06]} />
        <meshStandardMaterial color="#5a3820" roughness={0.7} />
      </mesh>
      {/* Cross brace */}
      <mesh position={[0, 0.7, 0.05]}>
        <boxGeometry args={[0.34, 0.04, 0.02]} />
        <meshStandardMaterial color="#5a3820" roughness={0.7} />
      </mesh>
      {/* Canvas */}
      <mesh position={[0, 1.15, 0.05]} castShadow>
        <boxGeometry args={[0.95, 1.1, 0.04]} />
        <meshStandardMaterial color="#f4ede0" roughness={0.7} />
      </mesh>
      {/* Painted strokes on canvas — bold abstract shapes */}
      <mesh position={[-0.18, 1.18, 0.07]}>
        <boxGeometry args={[0.4, 0.5, 0.005]} />
        <meshStandardMaterial color="#e83a78" roughness={0.6} emissive="#e83a78" emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0.22, 1.0, 0.07]}>
        <boxGeometry args={[0.3, 0.35, 0.005]} />
        <meshStandardMaterial color="#3ad4d4" roughness={0.6} emissive="#3ad4d4" emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0.05, 1.4, 0.07]}>
        <cylinderGeometry args={[0.12, 0.12, 0.006, 18]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.5} emissive="#fbbf24" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

/** Glowing white light table — emissive plane for sketching/animation */
function LightTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* 4 short legs */}
      {[
        [-0.55, 0.27, -0.35],
        [0.55, 0.27, -0.35],
        [-0.55, 0.27, 0.35],
        [0.55, 0.27, 0.35],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.08, 0.55, 0.08]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.6} />
        </mesh>
      ))}
      {/* Frame */}
      <mesh position={[0, 0.56, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.06, 0.85]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Glowing surface */}
      <mesh position={[0, 0.595, 0]}>
        <boxGeometry args={[1.2, 0.02, 0.78]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={1.4}
          roughness={0.2}
        />
      </mesh>
      {/* A few sketch pages stacked on top */}
      <mesh position={[-0.15, 0.62, 0.08]} rotation={[0, 0.1, 0]}>
        <boxGeometry args={[0.45, 0.005, 0.55]} />
        <meshStandardMaterial color="#f4ede0" roughness={0.85} />
      </mesh>
      <mesh position={[0.2, 0.625, -0.06]} rotation={[0, -0.06, 0]}>
        <boxGeometry args={[0.4, 0.005, 0.5]} />
        <meshStandardMaterial color="#fff8e8" roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Vibrant low-poly lounge chair */
function LoungeChair({
  position,
  color,
  rotationY,
}: {
  position: [number, number, number];
  color: string;
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Bowl seat (half-sphere) */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.5, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.12}
          roughness={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Cushion */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.4, 0.4, 0.08, 16]} />
        <meshStandardMaterial color="#f4ede0" roughness={0.7} />
      </mesh>
      {/* Center pole */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.36, 8]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Star base */}
      <mesh position={[0, 0.04, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 0.06, 16]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  );
}

/** Stylized monstera (big tropical plant) */
function Monstera({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      {/* Pot */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.4, 0.32, 0.6, 12]} />
        <meshStandardMaterial color="#c4724a" roughness={0.85} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.39, 0.39, 0.02, 12]} />
        <meshStandardMaterial color="#3a1f0e" roughness={0.9} />
      </mesh>
      {/* Stem */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 0.8, 8]} />
        <meshStandardMaterial color="#3d7a3c" roughness={0.7} />
      </mesh>
      {/* Big leaves — 5 oversized "blade" planes */}
      {[
        { rot: 0, h: 0.9 },
        { rot: Math.PI * 0.4, h: 0.85 },
        { rot: Math.PI * 0.8, h: 0.95 },
        { rot: Math.PI * 1.2, h: 0.8 },
        { rot: Math.PI * 1.6, h: 0.9 },
      ].map((leaf, i) => (
        <group key={i} position={[0, 1.3, 0]} rotation={[0, leaf.rot, 0]}>
          <mesh
            position={[0.55, leaf.h * 0.5, 0]}
            rotation={[0, 0, -Math.PI * 0.15]}
            castShadow
          >
            <boxGeometry args={[0.85, leaf.h, 0.04]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? "#3d7a3c" : "#4a8a48"}
              roughness={0.75}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
      {/* Top tuft */}
      <mesh position={[0, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.32, 12, 10]} />
        <meshStandardMaterial color="#336633" roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Red fire extinguisher on the wall */
function FireExtinguisher({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Body */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.5, 10]} />
        <meshStandardMaterial color="#cc2222" roughness={0.5} />
      </mesh>
      {/* Top valve */}
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, 0.06, 8]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Handle */}
      <mesh position={[0.05, 0.76, 0]} rotation={[0, 0, -Math.PI * 0.2]}>
        <boxGeometry args={[0.08, 0.02, 0.03]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.4} metalness={0.4} />
      </mesh>
      {/* Hose nozzle */}
      <mesh position={[0.06, 0.65, 0]} rotation={[0, 0, -Math.PI * 0.4]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.15, 6]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.5} />
      </mesh>
      {/* Label strip */}
      <mesh position={[0, 0.45, 0.082]}>
        <boxGeometry args={[0.08, 0.12, 0.003]} />
        <meshStandardMaterial color="#f4f4e8" roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Small side table with paint tubes and brushes */
function PaintSupplyTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Table top */}
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.04, 0.5]} />
        <meshStandardMaterial color="#f4ede0" roughness={0.6} />
      </mesh>
      {/* 4 legs */}
      {[[-0.3, 0.27, -0.2], [0.3, 0.27, -0.2], [-0.3, 0.27, 0.2], [0.3, 0.27, 0.2]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.04, 0.54, 0.04]} />
          <meshStandardMaterial color="#f4ede0" roughness={0.6} />
        </mesh>
      ))}
      {/* Paint tubes — colorful cylinders lying flat */}
      {[
        { x: -0.2, c: "#e83a78" },
        { x: -0.08, c: "#fbbf24" },
        { x: 0.04, c: "#3ad4d4" },
        { x: 0.16, c: "#c084fc" },
      ].map((t, i) => (
        <mesh key={i} position={[t.x, 0.59, 0]} rotation={[Math.PI / 2, 0, (i * 0.15) - 0.2]} castShadow>
          <cylinderGeometry args={[0.018, 0.012, 0.12, 6]} />
          <meshStandardMaterial color={t.c} roughness={0.4} />
        </mesh>
      ))}
      {/* Brush jar */}
      <mesh position={[0.25, 0.62, 0.05]} castShadow>
        <cylinderGeometry args={[0.04, 0.035, 0.1, 8]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.4} />
      </mesh>
      {/* Brushes sticking out */}
      {[-0.02, 0, 0.02].map((dx, i) => (
        <mesh key={`br${i}`} position={[0.25 + dx, 0.72, 0.05]} rotation={[0.1 * (i - 1), 0, 0.05 * (i - 1)]}>
          <cylinderGeometry args={[0.005, 0.005, 0.12, 4]} />
          <meshStandardMaterial color="#5a3820" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}
