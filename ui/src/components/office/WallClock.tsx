/**
 * WallClock — Tiny animated analog clock rendered on a mini canvas.
 */
import { useEffect, useRef } from "react";

interface WallClockProps {
  size?: number;
}

export function WallClock({ size = 28 }: WallClockProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const r = size / 2;
    const dpr = 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let running = true;
    const loop = (timestamp: number) => {
      if (!running) return;
      const t = timestamp / 1000;
      ctx.clearRect(0, 0, size, size);

      // Face
      ctx.fillStyle = "#111";
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(r, r, r - 1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      ctx.fillStyle = "#1a1a2a";
      ctx.beginPath(); ctx.arc(r, r, r - 3, 0, Math.PI * 2); ctx.fill();

      // Hour marks
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
        ctx.fillStyle = "#555";
        ctx.fillRect(r + Math.cos(angle) * (r - 5) - 0.5, r + Math.sin(angle) * (r - 5) - 0.5, 1, 1);
      }

      // Hour hand
      const hourAngle = (t / 120) * Math.PI * 2 - Math.PI / 2;
      ctx.strokeStyle = "#999"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(r, r);
      ctx.lineTo(r + Math.cos(hourAngle) * (r * 0.45), r + Math.sin(hourAngle) * (r * 0.45));
      ctx.stroke();

      // Minute hand
      const minAngle = (t / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(r, r);
      ctx.lineTo(r + Math.cos(minAngle) * (r * 0.65), r + Math.sin(minAngle) * (r * 0.65));
      ctx.stroke();

      // Center dot
      ctx.fillStyle = "#ef4444";
      ctx.beginPath(); ctx.arc(r, r, 1.5, 0, Math.PI * 2); ctx.fill();

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      width={size * 2}
      height={size * 2}
      style={{ width: size, height: size }}
    />
  );
}
