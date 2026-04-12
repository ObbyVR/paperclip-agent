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
  /** Agent status for the floating status ring color */
  agentStatus?: string;
  /** Agent display name shown as floating label */
  agentName?: string;
  /** Number of pending approvals — shows red badge if > 0 */
  pendingApprovals?: number;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  running: "#06b6d4",
  idle: "#6b7280",
  paused: "#f59e0b",
  error: "#ef4444",
};

/** Create a CanvasTexture with the agent's name for a floating label sprite */
const nameLabelCache = new Map<string, THREE.CanvasTexture>();
function getNameLabelTexture(name: string): THREE.CanvasTexture {
  const cached = nameLabelCache.get(name);
  if (cached) return cached;
  const w = 256;
  const h = 48;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  // Dark pill background
  ctx.fillStyle = "rgba(20, 12, 8, 0.75)";
  ctx.beginPath();
  ctx.moveTo(12, 4);
  ctx.lineTo(w - 12, 4);
  ctx.quadraticCurveTo(w - 4, 4, w - 4, 12);
  ctx.lineTo(w - 4, h - 12);
  ctx.quadraticCurveTo(w - 4, h - 4, w - 12, h - 4);
  ctx.lineTo(12, h - 4);
  ctx.quadraticCurveTo(4, h - 4, 4, h - 12);
  ctx.lineTo(4, 12);
  ctx.quadraticCurveTo(4, 4, 12, 4);
  ctx.closePath();
  ctx.fill();
  // Text
  ctx.fillStyle = "#ffeac2";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Truncate long names
  let display = name;
  if (ctx.measureText(display).width > w - 32) {
    while (display.length > 3 && ctx.measureText(display + "…").width > w - 32) {
      display = display.slice(0, -1);
    }
    display += "…";
  }
  ctx.fillText(display, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true;
  nameLabelCache.set(name, tex);
  return tex;
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
    {
      color,
      accent,
      skinTone = "#f4d4b8",
      isLeader,
      isCEO,
      agentStatus,
      agentName,
      pendingApprovals = 0,
      onClick,
      onPointerOver,
      onPointerOut,
    },
    ref,
  ) {
    const bubbleTexture = useMemo(() => getBubbleTexture(), []);
    const nameLabelTexture = useMemo(
      () => (agentName ? getNameLabelTexture(agentName) : null),
      [agentName],
    );
    const statusColor = STATUS_COLORS[agentStatus ?? "idle"] ?? STATUS_COLORS.idle;
    const isActive = agentStatus === "active" || agentStatus === "running";

    return (
      <group
        ref={ref}
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      >
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

        {/* ── Status ring — colored torus above head indicating active/idle/paused/error ── */}
        <mesh name="statusRing" position={[0, 1.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.1, 0.015, 6, 16]} />
          <meshStandardMaterial
            color={statusColor}
            emissive={statusColor}
            emissiveIntensity={isActive ? 1.2 : 0.4}
            roughness={0.3}
            metalness={0.5}
          />
        </mesh>

        {/* ── Working indicator — small animated gear-like dot above the status ring ── */}
        {isActive && (
          <mesh name="workDot" position={[0, 1.5, 0]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial
              color={statusColor}
              emissive={statusColor}
              emissiveIntensity={2.0}
              roughness={0.2}
            />
          </mesh>
        )}

        {/* ── Pending approval badge — red pulsing dot on the shoulder ── */}
        {pendingApprovals > 0 && (
          <mesh name="approvalBadge" position={[-0.22, 1.0, 0.15]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial
              color="#ef4444"
              emissive="#ef4444"
              emissiveIntensity={1.5}
              roughness={0.2}
            />
          </mesh>
        )}

        {/* ── Name label — floating sprite below feet ── */}
        {nameLabelTexture && (
          <sprite
            name="nameLabel"
            position={[0, -0.25, 0]}
            scale={[1.2, 0.22, 1]}
          >
            <spriteMaterial
              map={nameLabelTexture}
              transparent
              depthWrite={false}
            />
          </sprite>
        )}

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
        <mesh name="torso" position={[0, 0.65, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.2, 0.45, 4, 12]} />
          <meshStandardMaterial
            color={color}
            roughness={0.55}
            emissive={color}
            emissiveIntensity={0}
          />
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
        <mesh name="head" position={[0, 1.12, 0]} castShadow>
          <sphereGeometry args={[0.17, 16, 16]} />
          <meshStandardMaterial
            color={skinTone}
            roughness={0.55}
            emissive={skinTone}
            emissiveIntensity={0}
          />
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
