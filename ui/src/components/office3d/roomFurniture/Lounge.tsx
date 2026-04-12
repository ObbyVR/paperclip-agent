/**
 * Lounge — break/relax area dressing for the Lounge room
 * (xMin=-15, xMax=-3, zMin=-1, zMax=9). Pieces:
 *   - Foosball table
 *   - Wall-mounted TV (emissive news-like glow)
 *   - Vending machine / fridge combo
 *   - 2 tropical palm plants
 *   - Large shaggy rug accent
 *
 * The couch + coffee table are already rendered by OfficeFurniture using
 * RELAX positions. This file adds the extra room dressing.
 */
import * as THREE from "three";
import { getRoom } from "../officeRooms";

const ROOM = getRoom("lounge");
const CX = (ROOM.bounds.xMin + ROOM.bounds.xMax) / 2; // -9
const CZ = (ROOM.bounds.zMin + ROOM.bounds.zMax) / 2; // 4

export function Lounge() {
  return (
    <group>
      <FoosballTable position={[CX + 3.5, 0, CZ + 2.5]} />
      <WallTV position={[ROOM.bounds.xMin + 0.12, 2.2, CZ - 1.5]} />
      <VendingCombo position={[CX + 4.5, 0, CZ - 3.5]} />
      <TropicalPalm position={[CX - 4, 0, CZ + 3.5]} scale={1.1} />
      <TropicalPalm position={[CX + 3, 0, CZ - 3.5]} scale={0.9} />
      <ShaggyRug />
    </group>
  );
}

/** Foosball / table football */
function FoosballTable({ position }: { position: [number, number, number] }) {
  const tableColor = "#2a6a3a";
  return (
    <group position={position}>
      {/* Table body */}
      <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.14, 1.0]} />
        <meshStandardMaterial color={tableColor} roughness={0.7} />
      </mesh>
      {/* Playing field (bright green recessed area) */}
      <mesh position={[0, 0.725, 0]}>
        <boxGeometry args={[1.5, 0.01, 0.75]} />
        <meshStandardMaterial
          color="#3a8a4a"
          emissive="#3a8a4a"
          emissiveIntensity={0.15}
          roughness={0.6}
        />
      </mesh>
      {/* Field lines */}
      <mesh position={[0, 0.73, 0]}>
        <boxGeometry args={[0.02, 0.005, 0.75]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      {/* 4 thick legs */}
      {[
        [-0.8, 0.29, -0.4],
        [0.8, 0.29, -0.4],
        [-0.8, 0.29, 0.4],
        [0.8, 0.29, 0.4],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.1, 0.58, 0.1]} />
          <meshStandardMaterial color="#3a2010" roughness={0.7} />
        </mesh>
      ))}
      {/* Rods (4 rods crossing the table) */}
      {[-0.5, -0.15, 0.15, 0.5].map((z, i) => (
        <mesh key={`rod${i}`} position={[0, 0.78, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.015, 0.015, 2.0, 8]} />
          <meshStandardMaterial color="#c0c0c4" roughness={0.3} metalness={0.7} />
        </mesh>
      ))}
      {/* Players (tiny cylinders on rods) */}
      {[
        // Rod 0 (z=-0.5): 3 players
        { rod: -0.5, positions: [-0.45, 0, 0.45], color: "#e83a78" },
        // Rod 1 (z=-0.15): 5 players
        { rod: -0.15, positions: [-0.55, -0.25, 0, 0.25, 0.55], color: "#60a5fa" },
        // Rod 2 (z=0.15): 5 players
        { rod: 0.15, positions: [-0.55, -0.25, 0, 0.25, 0.55], color: "#e83a78" },
        // Rod 3 (z=0.5): 3 players
        { rod: 0.5, positions: [-0.45, 0, 0.45], color: "#60a5fa" },
      ].flatMap((rod) =>
        rod.positions.map((px, pi) => (
          <mesh
            key={`p${rod.rod}_${pi}`}
            position={[px, 0.78, rod.rod]}
          >
            <cylinderGeometry args={[0.03, 0.03, 0.08, 8]} />
            <meshStandardMaterial color={rod.color} roughness={0.5} />
          </mesh>
        )),
      )}
      {/* Goals */}
      {[-1, 1].map((side) => (
        <mesh key={`g${side}`} position={[side * 0.85, 0.72, 0]} castShadow>
          <boxGeometry args={[0.08, 0.12, 0.4]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Wall-mounted TV showing soft-glow "news" content */
function WallTV({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      {/* Bezel */}
      <mesh castShadow>
        <boxGeometry args={[2.0, 1.2, 0.06]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 0, 0.04]}>
        <boxGeometry args={[1.85, 1.05, 0.02]} />
        <meshStandardMaterial
          color="#0a0a18"
          emissive="#2a4a6a"
          emissiveIntensity={0.6}
          roughness={0.3}
        />
      </mesh>
      {/* News ticker bar at bottom */}
      <mesh position={[0, -0.42, 0.055]}>
        <boxGeometry args={[1.85, 0.12, 0.005]} />
        <meshStandardMaterial
          color="#e83a78"
          emissive="#e83a78"
          emissiveIntensity={0.4}
          roughness={0.3}
        />
      </mesh>
      {/* Headline block */}
      <mesh position={[-0.3, 0.15, 0.055]}>
        <boxGeometry args={[0.8, 0.06, 0.003]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.3}
          transparent
          opacity={0.5}
          roughness={0.3}
        />
      </mesh>
      {/* Image placeholder */}
      <mesh position={[0.5, 0.1, 0.055]}>
        <boxGeometry args={[0.6, 0.5, 0.005]} />
        <meshStandardMaterial
          color="#3a5a7a"
          emissive="#3a5a7a"
          emissiveIntensity={0.2}
          roughness={0.5}
        />
      </mesh>
    </group>
  );
}

/** Vending machine + fridge combo — two tall boxes side by side */
function VendingCombo({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Vending machine */}
      <mesh position={[-0.35, 1.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 2.0, 0.55]} />
        <meshStandardMaterial color="#c0c0c4" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Vending front panel */}
      <mesh position={[-0.35, 1.2, 0.28]}>
        <boxGeometry args={[0.5, 1.2, 0.02]} />
        <meshStandardMaterial
          color="#1a1a1e"
          emissive="#fbbf24"
          emissiveIntensity={0.15}
          roughness={0.4}
        />
      </mesh>
      {/* Drink slots visible */}
      {[0, 1, 2].map((row) =>
        [0, 1].map((col) => (
          <mesh
            key={`v${row}_${col}`}
            position={[-0.48 + col * 0.26, 1.5 - row * 0.3, 0.3]}
          >
            <cylinderGeometry args={[0.04, 0.04, 0.12, 8]} />
            <meshStandardMaterial
              color={["#e83a78", "#3ad4d4", "#fbbf24", "#34d399", "#60a5fa", "#c084fc"][row * 2 + col]}
              roughness={0.4}
            />
          </mesh>
        )),
      )}

      {/* Fridge */}
      <mesh position={[0.35, 1.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 2.0, 0.55]} />
        <meshStandardMaterial color="#f4f4f8" roughness={0.45} metalness={0.15} />
      </mesh>
      {/* Fridge handle */}
      <mesh position={[0.12, 1.0, 0.3]} castShadow>
        <boxGeometry args={[0.04, 0.5, 0.04]} />
        <meshStandardMaterial color="#c0c0c4" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Fridge door line */}
      <mesh position={[0.35, 0.5, 0.28]}>
        <boxGeometry args={[0.55, 0.02, 0.01]} />
        <meshStandardMaterial color="#d0d0d4" roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Stylized tropical palm tree */
function TropicalPalm({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      {/* Pot — round terracotta */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.35, 0.28, 0.6, 12]} />
        <meshStandardMaterial color="#a04020" roughness={0.85} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 0.02, 12]} />
        <meshStandardMaterial color="#3a1f0e" roughness={0.9} />
      </mesh>
      {/* Trunk */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 1.6, 8]} />
        <meshStandardMaterial color="#6a4a28" roughness={0.8} />
      </mesh>
      {/* Trunk ring marks */}
      {[0.8, 1.1, 1.4, 1.7].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <torusGeometry args={[0.072, 0.008, 4, 12]} />
          <meshStandardMaterial color="#4a3018" roughness={0.8} />
        </mesh>
      ))}
      {/* Fronds — 5 large blade-like leaves drooping outward */}
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (Math.PI * 2 * i) / 5;
        return (
          <group key={i} position={[0, 2.2, 0]} rotation={[0, angle, 0]}>
            <mesh
              position={[0.7, -0.15, 0]}
              rotation={[0, 0, -Math.PI * 0.2]}
              castShadow
            >
              <boxGeometry args={[1.2, 0.04, 0.25]} />
              <meshStandardMaterial
                color={i % 2 === 0 ? "#3d8a3c" : "#4a9a48"}
                roughness={0.7}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* Leaf tip — narrower extension */}
            <mesh
              position={[1.5, -0.45, 0]}
              rotation={[0, 0, -Math.PI * 0.35]}
              castShadow
            >
              <boxGeometry args={[0.6, 0.03, 0.15]} />
              <meshStandardMaterial
                color="#3a7a35"
                roughness={0.7}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Large cozy rug accent across the lounge floor */
function ShaggyRug() {
  return (
    <group>
      {/* Main rug */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, 0.006, CZ + 1]}
        receiveShadow
      >
        <planeGeometry args={[7, 5]} />
        <meshStandardMaterial color="#7a5a3a" roughness={0.95} />
      </mesh>
      {/* Inner lighter patch */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, 0.007, CZ + 1]}
        receiveShadow
      >
        <planeGeometry args={[6, 4]} />
        <meshStandardMaterial color="#8a6a4a" roughness={0.95} />
      </mesh>
    </group>
  );
}
