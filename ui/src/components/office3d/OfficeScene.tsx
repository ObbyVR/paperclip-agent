/**
 * OfficeScene — root R3F Canvas wrapping the entire 3D office.
 *
 * Single WebGL rendering context for:
 *   - Room shell (floor, walls, window)
 *   - Furniture (desks, couch)
 *   - Agents (low-poly figures with real shadows)
 *   - Lighting (directional sun, ambient fill, CEO lamp)
 *   - Atmosphere (dust particles in light beam, fog)
 */
import { Suspense, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { BlendFunction, KernelSize } from "postprocessing";
import { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import * as THREE from "three";
import { OfficeRoom } from "./OfficeRoom";
import { OfficeFurniture } from "./OfficeFurniture";
import { OfficeAgents } from "./OfficeAgents";
import {
  CAMERA,
  LIGHT_SUN_POS,
  LIGHT_CEO_LAMP_POS,
  DUST_CENTER,
  DUST_SIZE,
} from "./officeLayout";
import type { Agent } from "@paperclipai/shared";

interface OfficeSceneProps {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
  onReady?: () => void;
}

export function OfficeScene({ agents, onAgentClick, onReady }: OfficeSceneProps) {
  return (
    <Canvas
      shadows
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.65,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      camera={{
        position: CAMERA.position,
        fov: CAMERA.fov,
        near: CAMERA.near,
        far: CAMERA.far,
      }}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        touchAction: "none",
        pointerEvents: "auto",
        cursor: "grab",
      }}
      onCreated={() => {
        setTimeout(() => onReady?.(), 150);
      }}
    >
      {/* Background behind any transparent edges */}
      <color attach="background" args={["#e8cfa0"]} />
      {/* Soft warm fog — far enough to only affect depth perception */}
      <fog attach="fog" args={["#e8cfa0", 30, 80]} />

      <Lighting />
      <Atmosphere />

      <Suspense fallback={null}>
        <OfficeRoom />
        <OfficeFurniture />
        <OfficeAgents agents={agents} onAgentClick={onAgentClick} />
      </Suspense>

      {/* Post-processing pipeline — cinematic bloom on emissive materials
          (monitors, window gradient, sun disc, CEO halo, lamp shade) plus a
          soft vignette to frame the scene. */}
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.75}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.35}
          mipmapBlur
          kernelSize={KernelSize.LARGE}
        />
        <Vignette
          offset={0.2}
          darkness={0.55}
          blendFunction={BlendFunction.NORMAL}
        />
      </EffectComposer>

      {/* Manual OrbitControls attached directly to gl.domElement — more
          reliable than the drei wrapper on React 19 + R3F 9. */}
      <ManualOrbitControls />
    </Canvas>
  );
}

/**
 * Instantiates OrbitControls from three/examples imperatively and binds it
 * to the canvas DOM element. Updated every frame via useFrame.
 * Disposes cleanly on unmount.
 */
function ManualOrbitControls() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const ref = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const controls = new OrbitControlsImpl(camera, gl.domElement);
    controls.target.set(CAMERA.lookAt[0], CAMERA.lookAt[1], CAMERA.lookAt[2]);
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 30;
    controls.minPolarAngle = Math.PI * 0.15;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.0;
    controls.panSpeed = 0.6;
    controls.update();
    ref.current = controls;
    return () => {
      controls.dispose();
      ref.current = null;
    };
  }, [camera, gl]);

  useFrame(() => {
    ref.current?.update();
  });

  return null;
}

function Lighting() {
  return (
    <>
      {/* Strong ambient so materials are always visible even if directional fails */}
      <ambientLight intensity={1.5} color="#fff2d4" />

      {/* Warm directional from the window direction — the hero golden hour light */}
      <directionalLight
        position={LIGHT_SUN_POS}
        intensity={4.0}
        color="#ffeac2"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
      />

      {/* Fill from the opposite side — brighter so deep shadows still have detail */}
      <directionalLight
        position={[-6, 8, 6]}
        intensity={1.4}
        color="#fff4e0"
      />

      {/* CEO lamp point light */}
      <pointLight
        position={LIGHT_CEO_LAMP_POS}
        intensity={10}
        distance={6}
        decay={2}
        color="#fff4d6"
      />

      {/* Hemisphere top-light for soft warm sky bounce */}
      <hemisphereLight args={["#fff2d4", "#d4a878", 0.9]} />
    </>
  );
}

function Atmosphere() {
  return (
    <>
      {/* God ray: a long, stretched, additive-blended box coming from the
          window toward the floor, angled like a golden-hour beam. */}
      <mesh
        position={[3, 1.8, 0]}
        rotation={[0, 0, -Math.PI / 4]}
      >
        <boxGeometry args={[9, 2.2, 3.2]} />
        <meshBasicMaterial
          color="#ffd080"
          transparent
          opacity={0.08}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* A second, softer wider beam for the bloom feel */}
      <mesh
        position={[2.5, 1.4, 0]}
        rotation={[0, 0, -Math.PI / 4]}
      >
        <boxGeometry args={[10, 3.2, 4.2]} />
        <meshBasicMaterial
          color="#ffb060"
          transparent
          opacity={0.04}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Dust particles dancing in the sun beam */}
      <Sparkles
        count={80}
        scale={DUST_SIZE}
        position={DUST_CENTER}
        size={4}
        speed={0.2}
        color="#fff0c8"
        opacity={0.9}
      />
      {/* Smaller secondary cluster near the window */}
      <Sparkles
        count={40}
        scale={[3, 2, 4]}
        position={[6, 2, 0]}
        size={3}
        speed={0.25}
        color="#ffe4b0"
        opacity={0.7}
      />
    </>
  );
}
