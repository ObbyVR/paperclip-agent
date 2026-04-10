/**
 * OfficeRoom — floor, 4 walls, window frame. All low-poly, procedural textures.
 *
 * Walls are single-sided planes with normals pointing INWARD. This relies on
 * the default FrontSide rendering: a wall is visible only from the side its
 * normal faces (inside the room), so when the camera orbits behind a wall
 * (outside the room) that wall is backface-culled automatically — you always
 * see the 3 far walls closing the scene, never the wall between camera and
 * subject.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { ROOM, WINDOW } from "./officeLayout";

/** Generate a procedural parquet wood texture via CanvasTexture. */
function makeParquetTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Base warm wood
  ctx.fillStyle = "#6b4226";
  ctx.fillRect(0, 0, size, size);

  // Planks — staggered stripes
  const plankW = 64;
  const plankH = 16;
  for (let y = 0; y < size; y += plankH) {
    for (let x = 0; x < size; x += plankW) {
      const offsetX = (Math.floor(y / plankH) % 2) * (plankW / 2);
      const px = (x + offsetX) % size;
      const shade = 0.78 + Math.random() * 0.24;
      const r = Math.floor(107 * shade);
      const g = Math.floor(66 * shade);
      const b = Math.floor(38 * shade);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(px, y, plankW - 1, plankH - 1);

      // Wood grain lines
      ctx.strokeStyle = `rgba(30, 18, 10, 0.35)`;
      ctx.lineWidth = 0.5;
      const grainCount = 3 + Math.floor(Math.random() * 3);
      for (let g = 0; g < grainCount; g++) {
        const gy = y + 2 + Math.random() * (plankH - 4);
        ctx.beginPath();
        ctx.moveTo(px, gy);
        ctx.lineTo(px + plankW, gy + (Math.random() - 0.5) * 1.5);
        ctx.stroke();
      }
    }
  }

  // Warm sheen overlay
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "rgba(255, 220, 150, 0.08)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.12)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Golden-hour sky gradient for the window view */
function makeSkyTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Vertical gradient: pale cream top → warm gold mid → amber bottom
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#ffeec0");
  grad.addColorStop(0.35, "#ffdb8a");
  grad.addColorStop(0.7, "#ff9e54");
  grad.addColorStop(1.0, "#c75a28");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Soft sun disc high on the right
  const sunX = w * 0.72;
  const sunY = h * 0.32;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 60);
  sunGrad.addColorStop(0, "rgba(255, 255, 220, 1)");
  sunGrad.addColorStop(0.25, "rgba(255, 235, 160, 0.9)");
  sunGrad.addColorStop(0.7, "rgba(255, 180, 80, 0.2)");
  sunGrad.addColorStop(1.0, "rgba(255, 120, 40, 0)");
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, w, h);

  // Horizon band
  ctx.fillStyle = "rgba(70, 30, 14, 0.18)";
  ctx.fillRect(0, h * 0.72, w, 4);

  // Faint cloud wisps
  ctx.strokeStyle = "rgba(255, 240, 200, 0.25)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const y = h * (0.2 + i * 0.12);
    ctx.beginPath();
    ctx.moveTo(10 + i * 20, y);
    ctx.bezierCurveTo(60, y - 8, 120, y + 6, 200, y - 4);
    ctx.stroke();
  }

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
  const parquet = useMemo(() => makeParquetTexture(), []);
  const wall = useMemo(() => makeWallTexture(), []);
  const sky = useMemo(() => makeSkyTexture(), []);

  const halfW = ROOM.width / 2;
  const halfD = ROOM.depth / 2;
  const wallH = ROOM.height;

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshStandardMaterial map={parquet} roughness={0.75} metalness={0.05} />
      </mesh>

      {/*
        Walls are single-sided planes with normals pointing INTO the room.
        Result: a wall disappears when the camera moves behind it (outside
        the room), so you can orbit freely and always see the 3 far walls
        while the wall in front of the camera is culled.
      */}

      {/* Back wall (at z=-halfD) — default plane normal +Z already points inward */}
      <mesh position={[0, wallH / 2, -halfD]} receiveShadow>
        <planeGeometry args={[ROOM.width, wallH]} />
        <meshStandardMaterial map={wall} roughness={0.9} />
      </mesh>

      {/* Front wall (at z=+halfD) — rotate 180° so normal points -Z (inward) */}
      <mesh
        position={[0, wallH / 2, halfD]}
        rotation={[0, Math.PI, 0]}
        receiveShadow
      >
        <planeGeometry args={[ROOM.width, wallH]} />
        <meshStandardMaterial map={wall} roughness={0.9} />
      </mesh>

      {/* Left wall (at x=-halfW) — rotate +90° Y so normal points +X (inward) */}
      <mesh
        position={[-halfW, wallH / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[ROOM.depth, wallH]} />
        <meshStandardMaterial map={wall} roughness={0.9} />
      </mesh>

      {/* Right wall (+X) with window cut-out — split into 4 plane segments */}
      <RightWallWithWindow wallTexture={wall} skyTexture={sky} />

      {/* Baseboards — thin dark strip at bottom of walls */}
      <BaseBoards />
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

  // All right-wall segments are planes facing -X (room interior side).
  const rotation: [number, number, number] = [0, -Math.PI / 2, 0];

  return (
    <group>
      {/* Below window — full width */}
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
      {/* Above window */}
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
      {/* Left of window */}
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
      {/* Right of window */}
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
      {/* Window frame */}
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
      {/* Top */}
      <mesh position={[x, winCy + winH / 2, winCz]}>
        <boxGeometry args={[frameDepth, frameT, winW + frameT * 2]} />
        <meshStandardMaterial color="#3a2414" roughness={0.7} />
      </mesh>
      {/* Bottom */}
      <mesh position={[x, winCy - winH / 2, winCz]}>
        <boxGeometry args={[frameDepth, frameT, winW + frameT * 2]} />
        <meshStandardMaterial color="#3a2414" roughness={0.7} />
      </mesh>
      {/* Left */}
      <mesh position={[x, winCy, winCz - winW / 2]}>
        <boxGeometry args={[frameDepth, winH, frameT]} />
        <meshStandardMaterial color="#3a2414" roughness={0.7} />
      </mesh>
      {/* Right */}
      <mesh position={[x, winCy, winCz + winW / 2]}>
        <boxGeometry args={[frameDepth, winH, frameT]} />
        <meshStandardMaterial color="#3a2414" roughness={0.7} />
      </mesh>
      {/* Horizontal center mullion */}
      <mesh position={[x, winCy, winCz]}>
        <boxGeometry args={[frameDepth * 0.8, frameT * 0.7, winW]} />
        <meshStandardMaterial color="#3a2414" roughness={0.7} />
      </mesh>
      {/* Vertical center mullion */}
      <mesh position={[x, winCy, winCz]}>
        <boxGeometry args={[frameDepth * 0.8, winH, frameT * 0.7]} />
        <meshStandardMaterial color="#3a2414" roughness={0.7} />
      </mesh>
      {/* Sky visible through window — gradient texture (cream → gold → amber
          → sun disc) facing into the room. DoubleSide so it's visible from
          both sides when the camera orbits. */}
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
      {/* Back */}
      <mesh position={[0, bbH / 2, -halfD + bbT / 2]}>
        <boxGeometry args={[ROOM.width, bbH, bbT]} />
        <meshStandardMaterial color="#2a1810" roughness={0.8} />
      </mesh>
      {/* Front */}
      <mesh position={[0, bbH / 2, halfD - bbT / 2]}>
        <boxGeometry args={[ROOM.width, bbH, bbT]} />
        <meshStandardMaterial color="#2a1810" roughness={0.8} />
      </mesh>
      {/* Left */}
      <mesh position={[-halfW + bbT / 2, bbH / 2, 0]}>
        <boxGeometry args={[bbT, bbH, ROOM.depth]} />
        <meshStandardMaterial color="#2a1810" roughness={0.8} />
      </mesh>
      {/* Right */}
      <mesh position={[halfW - bbT / 2, bbH / 2, 0]}>
        <boxGeometry args={[bbT, bbH, ROOM.depth]} />
        <meshStandardMaterial color="#2a1810" roughness={0.8} />
      </mesh>
    </group>
  );
}
