/**
 * Confetti — Lightweight CSS particle burst.
 *
 * Usage: render <Confetti active /> to trigger a burst. Set active=false to clear.
 * Particles auto-remove after animation completes.
 */
import { useEffect, useState } from "react";

const COLORS = ["#a78bfa", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#eab308"];
const PARTICLE_COUNT = 40;

interface Particle {
  id: number;
  x: number;
  color: string;
  angle: number;
  velocity: number;
  spin: number;
  size: number;
  shape: "square" | "circle" | "strip";
}

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: 40 + Math.random() * 20, // % from left (centered burst)
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    angle: -90 + (Math.random() - 0.5) * 120, // spread upward
    velocity: 300 + Math.random() * 400,
    spin: (Math.random() - 0.5) * 720,
    size: 4 + Math.random() * 6,
    shape: (["square", "circle", "strip"] as const)[Math.floor(Math.random() * 3)],
  }));
}

interface ConfettiProps {
  active: boolean;
}

export function Confetti({ active }: ConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (active) {
      setParticles(makeParticles());
      setKey((k) => k + 1);
      // Clear after animation
      const timer = setTimeout(() => setParticles([]), 2500);
      return () => clearTimeout(timer);
    } else {
      setParticles([]);
    }
  }, [active]);

  if (particles.length === 0) return null;

  return (
    <div key={key} className="fixed inset-0 pointer-events-none z-[100] overflow-hidden" aria-hidden="true">
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180;
        const dx = Math.cos(rad) * p.velocity;
        const dy = Math.sin(rad) * p.velocity;
        const borderRadius = p.shape === "circle" ? "50%" : p.shape === "strip" ? "1px" : "2px";
        const w = p.shape === "strip" ? p.size * 0.4 : p.size;
        const h = p.shape === "strip" ? p.size * 1.5 : p.size;

        return (
          <div
            key={p.id}
            className="absolute"
            style={{
              left: `${p.x}%`,
              top: "50%",
              width: w,
              height: h,
              backgroundColor: p.color,
              borderRadius,
              animation: `confetti-fall 2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
              // Custom properties for the animation
              ["--dx" as string]: `${dx}px`,
              ["--dy" as string]: `${dy}px`,
              ["--spin" as string]: `${p.spin}deg`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 1;
          }
          60% {
            opacity: 1;
          }
          100% {
            transform: translate(var(--dx), calc(var(--dy) + 600px)) rotate(var(--spin));
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
