/**
 * Agent3D — pure render component for a single agent.
 * No state, no logic — receives pose from AgentController in useFrame.
 *
 * Anatomy (all centered around the group origin at foot level when standing):
 *   torso:  capsule at y=0.55, radius 0.2, height 0.5
 *   head:   sphere at y=1.02, radius 0.17
 *   hair:   hemisphere cap
 *   arms:   two thin capsules hanging at y=0.55, x=±0.28
 *   legs:   two thin boxes at y=0.22, x=±0.11
 *   badge:  ring above head for leaders/CEO
 *
 * Size variation is applied via group scale at assignment time.
 */
import { forwardRef, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

export interface Agent3DProps {
  color: string;
  accent?: string;
  skinTone?: string;
  isLeader?: boolean;
  isCEO?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

/** Shared CanvasTexture for the "..." speech bubble — generated once. */
let cachedBubbleTexture: THREE.CanvasTexture | null = null;
function getBubbleTexture(): THREE.CanvasTexture {
  if (cachedBubbleTexture) return cachedBubbleTexture;
  const w = 128;
  const h = 96;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Soft shadow under the bubble
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  roundRect(ctx, 10, 12, w - 20, h - 36, 14);
  ctx.fill();

  // White bubble body
  ctx.fillStyle = "#fffaf0";
  roundRect(ctx, 8, 8, w - 20, h - 36, 14);
  ctx.fill();

  // Tail pointing down
  ctx.fillStyle = "#fffaf0";
  ctx.beginPath();
  ctx.moveTo(w / 2 - 12, h - 28);
  ctx.lineTo(w / 2, h - 10);
  ctx.lineTo(w / 2 + 12, h - 28);
  ctx.closePath();
  ctx.fill();

  // Three dark dots "..."
  ctx.fillStyle = "#2a1810";
  const cy = (h - 36) / 2 + 8;
  [-18, 0, 18].forEach((dx) => {
    ctx.beginPath();
    ctx.arc((w - 12) / 2 + dx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true;
  cachedBubbleTexture = tex;
  return tex;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const SKIN_TONES = ["#f4d4b8", "#e8c4a4", "#d4a78a", "#c48d70", "#b67a5e", "#a0623f"];
const HAIR_TONES = ["#2a1810", "#4a2c1a", "#6b3e20", "#8b5a30", "#3a2818", "#1a0e06"];

export function hashToSkinTone(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return SKIN_TONES[Math.abs(h) % SKIN_TONES.length];
}

export function hashToHairTone(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 37 + id.charCodeAt(i)) | 0;
  return HAIR_TONES[Math.abs(h >> 3) % HAIR_TONES.length];
}

export const Agent3D = forwardRef<THREE.Group, Agent3DProps>(
  function Agent3D(
    { color, accent, skinTone = "#f4d4b8", isLeader, isCEO, onClick },
    ref,
  ) {
    const bubbleTexture = useMemo(() => getBubbleTexture(), []);
    return (
      <group ref={ref} onClick={onClick}>
        {/* Speech bubble — hidden by default, OfficeAgents toggles visible
            based on FSM state (reporting / chatting_with_peer) */}
        <sprite
          name="bubble"
          position={[0, 1.75, 0]}
          scale={[0.6, 0.45, 1]}
          visible={false}
        >
          <spriteMaterial
            map={bubbleTexture}
            transparent
            depthWrite={false}
          />
        </sprite>

        {/* ── LEGS ── each leg is a sub-group pivoted at the hip joint so
            rotation.x produces a natural walking swing. */}
        <group name="leftLeg" position={[-0.1, 0.44, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <boxGeometry args={[0.12, 0.44, 0.14]} />
            <meshStandardMaterial color="#2a1a0e" roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.41, 0.05]} castShadow>
            <boxGeometry args={[0.14, 0.06, 0.22]} />
            <meshStandardMaterial color="#140a05" />
          </mesh>
        </group>
        <group name="rightLeg" position={[0.1, 0.44, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <boxGeometry args={[0.12, 0.44, 0.14]} />
            <meshStandardMaterial color="#2a1a0e" roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.41, 0.05]} castShadow>
            <boxGeometry args={[0.14, 0.06, 0.22]} />
            <meshStandardMaterial color="#140a05" />
          </mesh>
        </group>

        {/* ── TORSO ── */}
        <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.2, 0.45, 4, 12]} />
          <meshStandardMaterial color={color} roughness={0.55} />
        </mesh>

        {/* ── ARMS ── sub-groups pivoted at the shoulder for walking swing */}
        <group name="leftArm" position={[-0.28, 0.87, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <capsuleGeometry args={[0.07, 0.4, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.55} />
          </mesh>
          <mesh position={[0, -0.42, 0]} castShadow>
            <sphereGeometry args={[0.075, 8, 8]} />
            <meshStandardMaterial color={skinTone} roughness={0.6} />
          </mesh>
        </group>
        <group name="rightArm" position={[0.28, 0.87, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <capsuleGeometry args={[0.07, 0.4, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.55} />
          </mesh>
          <mesh position={[0, -0.42, 0]} castShadow>
            <sphereGeometry args={[0.075, 8, 8]} />
            <meshStandardMaterial color={skinTone} roughness={0.6} />
          </mesh>
        </group>

        {/* ── NECK ── */}
        <mesh position={[0, 0.99, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.07, 0.08, 8]} />
          <meshStandardMaterial color={skinTone} roughness={0.6} />
        </mesh>

        {/* ── HEAD ── */}
        <mesh position={[0, 1.12, 0]} castShadow>
          <sphereGeometry args={[0.17, 16, 16]} />
          <meshStandardMaterial color={skinTone} roughness={0.55} />
        </mesh>

        {/* ── EYES ── small dark discs to give direction */}
        <mesh position={[-0.06, 1.14, 0.15]} castShadow={false}>
          <sphereGeometry args={[0.018, 6, 6]} />
          <meshStandardMaterial color="#0a0a0a" />
        </mesh>
        <mesh position={[0.06, 1.14, 0.15]} castShadow={false}>
          <sphereGeometry args={[0.018, 6, 6]} />
          <meshStandardMaterial color="#0a0a0a" />
        </mesh>

        {/* ── HAIR CAP ── hemisphere on top of head */}
        <mesh position={[0, 1.19, -0.015]} castShadow>
          <sphereGeometry
            args={[0.175, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]}
          />
          <meshStandardMaterial color={accent ?? "#2a1810"} roughness={0.7} />
        </mesh>

        {/* ── LEADER / CEO BADGE ── small subtle ring above head (only CEO) */}
        {isCEO && (
          <mesh position={[0, 1.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.07, 0.013, 6, 16]} />
            <meshStandardMaterial
              color="#ffd700"
              emissive="#ffa000"
              emissiveIntensity={0.5}
              metalness={0.8}
              roughness={0.25}
            />
          </mesh>
        )}
        {/* Leaders get a tiny pin on the shoulder instead of a halo */}
        {isLeader && !isCEO && (
          <mesh position={[0.18, 0.9, 0.1]}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshStandardMaterial
              color="#fbbf24"
              emissive="#f59e0b"
              emissiveIntensity={0.4}
            />
          </mesh>
        )}

        {/* Invisible hit target (larger than body, above head) */}
        <mesh position={[0, 0.7, 0]} visible={false}>
          <boxGeometry args={[0.9, 1.6, 0.9]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>
    );
  },
);
