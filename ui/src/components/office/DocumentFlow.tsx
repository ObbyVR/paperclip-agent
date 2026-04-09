/**
 * DocumentFlow — Animated paper icons floating between agents.
 *
 * Shows small document/paper particles drifting from agents with
 * pending approvals toward the CEO office. Pure visual decoration
 * that communicates "work is flowing through the system".
 */
import { useMemo } from "react";

interface FlowParticle {
  id: string;
  delay: number;
  duration: number;
  xStart: number;
  color: string;
}

interface DocumentFlowProps {
  /** Number of pending approvals — controls particle density */
  pendingCount: number;
}

export function DocumentFlow({ pendingCount }: DocumentFlowProps) {
  const particles = useMemo(() => {
    if (pendingCount === 0) return [];
    const count = Math.min(pendingCount * 2, 8);
    return Array.from({ length: count }, (_, i): FlowParticle => ({
      id: `doc-${i}`,
      delay: i * 1.2 + Math.random() * 0.5,
      duration: 4 + Math.random() * 3,
      xStart: 20 + Math.random() * 60,
      color: i % 3 === 0 ? "#a78bfa" : i % 3 === 1 ? "#f59e0b" : "#22c55e",
    }));
  }, [pendingCount]);

  if (particles.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.xStart}%`,
            bottom: "70%",
            animation: `doc-float ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        >
          {/* Mini paper icon */}
          <svg width="10" height="12" viewBox="0 0 10 12" fill="none" style={{ opacity: 0.3 }}>
            <rect x="0" y="0" width="8" height="11" rx="1" fill={p.color} opacity="0.5" />
            <path d="M6 0 L8 2 L6 2 Z" fill={p.color} opacity="0.7" />
            <line x1="2" y1="4" x2="6" y2="4" stroke={p.color} strokeWidth="0.5" opacity="0.4" />
            <line x1="2" y1="6" x2="5" y2="6" stroke={p.color} strokeWidth="0.5" opacity="0.4" />
            <line x1="2" y1="8" x2="6" y2="8" stroke={p.color} strokeWidth="0.5" opacity="0.4" />
          </svg>
        </div>
      ))}
      <style>{`
        @keyframes doc-float {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
          10% { opacity: 0.4; }
          50% { transform: translate(${Math.random() > 0.5 ? '' : '-'}30px, -120px) rotate(15deg); opacity: 0.25; }
          90% { opacity: 0.1; }
          100% { transform: translate(0px, -200px) rotate(-10deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
