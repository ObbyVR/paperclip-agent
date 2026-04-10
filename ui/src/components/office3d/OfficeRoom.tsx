/**
 * OfficeRoom — outer shell + per-room floors + interior walls (with portal
 * cutouts). All low-poly, procedural textures.
 *
 * v12: the room is divided into 5 sub-rooms by interior walls. Each sub-room
 * gets its own floor patch + material; the walls between sub-rooms are
 * rendered with cutouts at portal positions so agents can walk through.
 *
 * Outer walls are single-sided planes with normals pointing INWARD so the
 * camera-facing wall is automatically backface-culled when orbiting.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { ROOM, WINDOW } from "./officeLayout";
import { ROOMS, INTERNAL_WALLS } from "./officeRooms";
import { buildFloorStyle } from "./floorMaterials";

/** Golden-hour sky gradient for the window view with skyline silhouette. */
function makeSkyTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Vertical gradient: pale cream top → warm gold → deep amber near horizon
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#ffeec0");
  grad.addColorStop(0.25, "#ffdb8a");
  grad.addColorStop(0.55, "#ff9e54");
  grad.addColorStop(0.78, "#e2692a");
  grad.addColorStop(1.0, "#a83a16");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Soft sun disc high on the right
  const sunX = w * 0.7;
  const sunY = h * 0.28;
  const sunRadius = 110;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, sunRadius);
  sunGrad.addColorStop(0, "rgba(255, 255, 230, 1)");
  sunGrad.addColorStop(0.18, "rgba(255, 240, 170, 0.92)");
  sunGrad.addColorStop(0.5, "rgba(255, 190, 90, 0.35)");
  sunGrad.addColorStop(1.0, "rgba(255, 120, 40, 0)");
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, w, h);

  // Sun core — bright disc
  ctx.fillStyle = "rgba(255, 252, 220, 0.95)";
  ctx.beginPath();
  ctx.arc(sunX, sunY, 18, 0, Math.PI * 2);
  ctx.fill();

  // Background mountains
  ctx.fillStyle = "rgba(80, 40, 50, 0.35)";
  ctx.beginPath();
  const mountainH = h * 0.68;
  ctx.moveTo(0, mountainH);
  const peaks = 7;
  for (let i = 0; i <= peaks; i++) {
    const x = (w / peaks) * i;
    const peakDrop = 18 + ((i * 37) % 40);
    const midY = mountainH - peakDrop;
    const ctrlX = x - w / (peaks * 2);
    ctx.quadraticCurveTo(ctrlX, mountainH + 4, x, midY);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Foreground skyline
  ctx.fillStyle = "rgba(30, 12, 18, 0.88)";
  const baseY = h * 0.82;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, baseY);
  let cx = 0;
  const buildings: Array<{ w: number; h: number }> = [
    { w: 32, h: 52 },
    { w: 22, h: 38 },
    { w: 38, h: 72 },
    { w: 18, h: 44 },
    { w: 28, h: 58 },
    { w: 46, h: 96 },
    { w: 20, h: 36 },
    { w: 36, h: 64 },
    { w: 24, h: 48 },
    { w: 30, h: 58 },
    { w: 42, h: 80 },
    { w: 26, h: 50 },
    { w: 34, h: 66 },
    { w: 22, h: 40 },
    { w: 40, h: 74 },
    { w: 28, h: 54 },
  ];
  for (const b of buildings) {
    const top = baseY - b.h;
    ctx.lineTo(cx, top);
    if (b.h > 70) {
      ctx.lineTo(cx + b.w * 0.45, top - 12);
      ctx.lineTo(cx + b.w * 0.5, top);
    }
    ctx.lineTo(cx + b.w, top);
    ctx.lineTo(cx + b.w, baseY);
    cx += b.w;
  }
  ctx.lineTo(w, baseY);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // Lit windows
  ctx.fillStyle = "rgba(255, 220, 130, 0.9)";
  cx = 0;
  for (const b of buildings) {
    if (b.h >= 50) {
      const cols = Math.floor(b.w / 6);
      const rows = Math.floor(b.h / 10);
      for (let r = 1; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
          if (((r * 13 + col * 7 + Math.floor(cx)) % 5) < 2) {
            const wx = cx + 3 + col * 6;
            const wy = baseY - r * 10;
            ctx.fillRect(wx, wy, 2, 3);
          }
        }
      }
    }
    cx += b.w;
  }

  // Cloud wisps
  ctx.strokeStyle = "rgba(255, 240, 200, 0.5)";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  const cloudYs = [0.12, 0.2, 0.32, 0.44, 0.56];
  for (let i = 0; i < cloudYs.length; i++) {
    const y = h * cloudYs[i];
    const startX = 20 + (i * 73) % (w - 40);
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.bezierCurveTo(
      startX + 80,
      y - 14 + (i % 2) * 8,
      startX + 160,
      y + 10 - (i % 2) * 6,
      startX + 240,
      y + 4,
    );
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255, 210, 160, 0.35)";
  ctx.lineWidth = 22;
  for (let i = 0; i < 3; i++) {
    const y = h * (0.15 + i * 0.13);
    ctx.beginPath();
    ctx.moveTo(w * 0.1, y);
    ctx.bezierCurveTo(
      w * 0.35,
      y - 18,
      w * 0.65,
      y + 12,
      w * 0.9,
      y - 6,
    );
    ctx.stroke();
  }

  // Birds
  ctx.strokeStyle = "rgba(20, 10, 12, 0.65)";
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  const birds: Array<[number, number]> = [
    [w * 0.18, h * 0.2],
    [w * 0.24, h * 0.22],
    [w * 0.42, h * 0.14],
    [w * 0.55, h * 0.18],
    [w * 0.85, h * 0.13],
  ];
  for (const [bx, by] of birds) {
    ctx.beginPath();
    ctx.moveTo(bx - 5, by);
    ctx.quadraticCurveTo(bx - 2.5, by - 3, bx, by);
    ctx.quadraticCurveTo(bx + 2.5, by - 3, bx + 5, by);
    ctx.stroke();
  }

  // Horizon glow band right above the skyline
  const glowGrad = ctx.createLinearGradient(0, baseY - 24, 0, baseY + 4);
  glowGrad.addColorStop(0, "rgba(255, 180, 90, 0)");
  glowGrad.addColorStop(0.6, "rgba(255, 160, 70, 0.35)");
  glowGrad.addColorStop(1, "rgba(255, 120, 40, 0)");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, baseY - 24, w, 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Wall plaster texture — soft warm cream */
function makeWallTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#d4b896";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = Math.random() * 0.08;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function OfficeRoom() {
  const wall = useMemo(() => makeWallTexture(), []);
  const sky = useMemo(() => makeSkyTexture(), []);

  // Build one floor style per room (memoised). Each room clones its texture
  // so the UV repeat can be set per-room without mutating shared state.
  const floorPatches = useMemo(() => {
    return ROOMS.map((room) => {
      const style = buildFloorStyle(room.floorMaterial);
      const w = room.bounds.xMax - room.bounds.xMin;
      const d = room.bounds.zMax - room.bounds.zMin;
      const cx = (room.bounds.xMin + room.bounds.xMax) / 2;
      const cz = (room.bounds.zMin + room.bounds.zMax) / 2;
      style.texture.repeat.set(w * style.repeatPerUnit, d * style.repeatPerUnit);
      style.texture.needsUpdate = true;
      return { room, style, w, d, cx, cz };
    });
  }, []);

  const halfW = ROOM.width / 2;
  const halfD = ROOM.depth / 2;
  const wallH = ROOM.height;

  return (
    <group>
      {/* Per-room floor patches */}
      {floorPatches.map(({ room, style, w, d, cx, cz }) => (
        <mesh
          key={room.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[cx, 0.001, cz]}
          receiveShadow
        >
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial
            map={style.texture}
            roughness={style.roughness}
            metalness={style.metalness}
          />
        </mesh>
      ))}

      {/* OUTER walls — single-sided, normal pointing inward */}

      {/* Back wall (z=-halfD) */}
      <mesh position={[0, wallH / 2, -halfD]} receiveShadow>
        <planeGeometry args={[ROOM.width, wallH]} />
        <meshStandardMaterial map={wall} roughness={0.9} />
      </mesh>

      {/* Front wall (z=+halfD) */}
      <mesh
        position={[0, wallH / 2, halfD]}
        rotation={[0, Math.PI, 0]}
        receiveShadow
      >
        <planeGeometry args={[ROOM.width, wallH]} />
        <meshStandardMaterial map={wall} roughness={0.9} />
      </mesh>

      {/* Left wall (-X) */}
      <mesh
        position={[-halfW, wallH / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[ROOM.depth, wallH]} />
        <meshStandardMaterial map={wall} roughness={0.9} />
      </mesh>

      {/* Right wall (+X) with window */}
      <RightWallWithWindow wallTexture={wall} skyTexture={sky} />

      {/* Baseboards on outer walls */}
      <BaseBoards />

      {/* INTERIOR walls between rooms, with portal cutouts */}
      <InternalWalls wallTexture={wall} />
    </group>
  );
}

/**
 * Renders all interior walls listed in INTERNAL_WALLS. Each wall is a series
 * of plane segments arranged around the portal openings on that wall. Walls
 * are double-sided (visible from both rooms they divide).
 */
function InternalWalls({ wallTexture }: { wallTexture: THREE.Texture }) {
  const wallH = ROOM.height;

  return (
    <group>
      {INTERNAL_WALLS.map((wallDef, wallIdx) => {
        // Sort openings by center, then build the wall as N+1 segments
        const openings = [...wallDef.openings].sort(
          (a, b) => a.center - b.center,
        );
        const segments: Array<{ start: number; end: number }> = [];
        let cursor = wallDef.range[0];
        for (const op of openings) {
          const opStart = op.center - op.width / 2;
          const opEnd = op.center + op.width / 2;
          if (opStart > cursor) {
            segments.push({ start: cursor, end: opStart });
          }
          cursor = Math.max(cursor, opEnd);
        }
        if (cursor < wallDef.range[1]) {
          segments.push({ start: cursor, end: wallDef.range[1] });
        }

        return segments.map((seg, segIdx) => {
          const segLen = seg.end - seg.start;
          if (segLen <= 0.01) return null;
          const segCenter = (seg.start + seg.end) / 2;
          if (wallDef.axis === "x") {
            // Wall lies on a constant-X plane, extends along Z
            return (
              <mesh
                key={`w${wallIdx}s${segIdx}`}
                position={[wallDef.at, wallH / 2, segCenter]}
                rotation={[0, Math.PI / 2, 0]}
                receiveShadow
                castShadow
              >
                <planeGeometry args={[segLen, wallH]} />
                <meshStandardMaterial
                  map={wallTexture}
                  roughness={0.9}
                  side={THREE.DoubleSide}
                />
              </mesh>
            );
          } else {
            // Wall lies on a constant-Z plane, extends along X
            return (
              <mesh
                key={`w${wallIdx}s${segIdx}`}
                position={[segCenter, wallH / 2, wallDef.at]}
                receiveShadow
                castShadow
              >
                <planeGeometry args={[segLen, wallH]} />
                <meshStandardMaterial
                  map={wallTexture}
                  roughness={0.9}
                  side={THREE.DoubleSide}
                />
              </mesh>
            );
          }
        });
      })}

      {/* Door lintels — slim header bar above each opening to read as a
          doorway rather than a wall hole */}
      {INTERNAL_WALLS.flatMap((wallDef, wallIdx) =>
        wallDef.openings.map((op, opIdx) => {
          const lintelH = 0.18;
          const lintelY = wallH - lintelH / 2 - 0.6;
          if (wallDef.axis === "x") {
            return (
              <mesh
                key={`l${wallIdx}_${opIdx}`}
                position={[wallDef.at, lintelY, op.center]}
                castShadow
              >
                <boxGeometry args={[0.16, lintelH, op.width]} />
                <meshStandardMaterial color="#3a2414" roughness={0.7} />
              </mesh>
            );
          } else {
            return (
              <mesh
                key={`l${wallIdx}_${opIdx}`}
                position={[op.center, lintelY, wallDef.at]}
                castShadow
              >
                <boxGeometry args={[op.width, lintelH, 0.16]} />
                <meshStandardMaterial color="#3a2414" roughness={0.7} />
              </mesh>
            );
          }
        }),
      )}
    </group>
  );
}

function RightWallWithWindow({
  wallTexture,
  skyTexture,
}: {
  wallTexture: THREE.Texture;
  skyTexture: THREE.Texture;
}) {
  const halfW = ROOM.width / 2;
  const halfD = ROOM.depth / 2;
  const wallH = ROOM.height;

  const winW = WINDOW.width;
  const winH = WINDOW.height;
  const winCy = WINDOW.centerY;
  const winCz = WINDOW.centerZ;

  const winBottom = winCy - winH / 2;
  const winTop = winCy + winH / 2;
  const winZL = winCz - winW / 2;
  const winZR = winCz + winW / 2;

  const belowH = winBottom;
  const aboveH = wallH - winTop;
  const leftD = winZL - -halfD;
  const rightD = halfD - winZR;

  const rotation: [number, number, number] = [0, -Math.PI / 2, 0];

  return (
    <group>
      {belowH > 0.01 && (
        <mesh
          position={[halfW, belowH / 2, 0]}
          rotation={rotation}
          receiveShadow
        >
          <planeGeometry args={[ROOM.depth, belowH]} />
          <meshStandardMaterial map={wallTexture} roughness={0.9} />
        </mesh>
      )}
      {aboveH > 0.01 && (
        <mesh
          position={[halfW, winTop + aboveH / 2, 0]}
          rotation={rotation}
          receiveShadow
        >
          <planeGeometry args={[ROOM.depth, aboveH]} />
          <meshStandardMaterial map={wallTexture} roughness={0.9} />
        </mesh>
      )}
      {leftD > 0.01 && (
        <mesh
          position={[halfW, winCy, -halfD + leftD / 2]}
          rotation={rotation}
          receiveShadow
        >
          <planeGeometry args={[leftD, winH]} />
          <meshStandardMaterial map={wallTexture} roughness={0.9} />
        </mesh>
      )}
      {rightD > 0.01 && (
        <mesh
          position={[halfW, winCy, halfD - rightD / 2]}
          rotation={rotation}
          receiveShadow
        >
          <planeGeometry args={[rightD, winH]} />
          <meshStandardMaterial map={wallTexture} roughness={0.9} />
        </mesh>
      )}
      <WindowFrame skyTexture={skyTexture} />
    </group>
  );
}

function WindowFrame({ skyTexture }: { skyTexture: THREE.Texture }) {
  const halfW = ROOM.width / 2;
  const winW = WINDOW.width;
  const winH = WINDOW.height;
  const winCy = WINDOW.centerY;
  const winCz = WINDOW.centerZ;
  const frameT = 0.08;
  const frameDepth = 0.12;
  const x = halfW - 0.05;

  return (
    <group>
      <mesh position={[x, winCy + winH / 2, winCz]}>
        <boxGeometry args={[frameDepth, frameT, winW + frameT * 2]} />
        <meshStandardMaterial color="#3a2414" roughness={0.7} />
      </mesh>
      <mesh position={[x, winCy - winH / 2, winCz]}>
        <boxGeometry args={[frameDepth, frameT, winW + frameT * 2]} />
        <meshStandardMaterial color="#3a2414" roughness={0.7} />
      </mesh>
      <mesh position={[x, winCy, winCz - winW / 2]}>
        <boxGeometry args={[frameDepth, winH, frameT]} />
        <meshStandardMaterial color="#3a2414" roughness={0.7} />
      </mesh>
      <mesh position={[x, winCy, winCz + winW / 2]}>
        <boxGeometry args={[frameDepth, winH, frameT]} />
        <meshStandardMaterial color="#3a2414" roughness={0.7} />
      </mesh>
      <mesh position={[x, winCy, winCz]}>
        <boxGeometry args={[frameDepth * 0.8, frameT * 0.7, winW]} />
        <meshStandardMaterial color="#3a2414" roughness={0.7} />
      </mesh>
      <mesh position={[x, winCy, winCz]}>
        <boxGeometry args={[frameDepth * 0.8, winH, frameT * 0.7]} />
        <meshStandardMaterial color="#3a2414" roughness={0.7} />
      </mesh>
      <mesh
        position={[x - 0.05, winCy, winCz]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[winW, winH]} />
        <meshBasicMaterial map={skyTexture} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function BaseBoards() {
  const halfW = ROOM.width / 2;
  const halfD = ROOM.depth / 2;
  const bbH = 0.15;
  const bbT = 0.04;
  return (
    <group>
      <mesh position={[0, bbH / 2, -halfD + bbT / 2]}>
        <boxGeometry args={[ROOM.width, bbH, bbT]} />
        <meshStandardMaterial color="#2a1810" roughness={0.8} />
      </mesh>
      <mesh position={[0, bbH / 2, halfD - bbT / 2]}>
        <boxGeometry args={[ROOM.width, bbH, bbT]} />
        <meshStandardMaterial color="#2a1810" roughness={0.8} />
      </mesh>
      <mesh position={[-halfW + bbT / 2, bbH / 2, 0]}>
        <boxGeometry args={[bbT, bbH, ROOM.depth]} />
        <meshStandardMaterial color="#2a1810" roughness={0.8} />
      </mesh>
      <mesh position={[halfW - bbT / 2, bbH / 2, 0]}>
        <boxGeometry args={[bbT, bbH, ROOM.depth]} />
        <meshStandardMaterial color="#2a1810" roughness={0.8} />
      </mesh>
    </group>
  );
}
