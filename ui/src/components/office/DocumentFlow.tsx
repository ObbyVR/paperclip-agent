/**
 * DocumentFlow — Animated paper icons floating between agents.
 *
 * Two layers:
 * 1. Approval docs: colored papers flying upward when approvals are pending
 * 2. Ambient dust: subtle floating specks that make the office feel alive
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
  /** Number of pending approvals — controls document particle density */
  pendingCount: number;
}

export function DocumentFlow({ pendingCount }: DocumentFlowProps) {
  const docParticles = useMemo(() => {
    if (pendingCount === 0) return [];
    const count = Math.min(pendingCount * 2, 8);
    return Array.from({ length: count }, (_, i): FlowParticle => ({
      id: `doc-${i}`,
      delay: i * 1.5 + Math.random() * 0.8,
      duration: 5 + Math.random() * 3,
      xStart: 15 + Math.random() * 70,
      color: i % 3 === 0 ? "#a78bfa" : i % 3 === 1 ? "#f59e0b" : "#22c55e",
    }));
  }, [pendingCount]);

  // Ambient dust particles — always present
  const dustParticles = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => ({
      id: `dust-${i}`,
      delay: i * 2.5 + Math.random() * 2,
      duration: 8 + Math.random() * 6,
      xStart: 10 + Math.random() * 80,
      size: 1.5 + Math.random() * 1.5,
    }));
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]" aria-hidden="true">
      {/* Ambient dust — always visible, slow-moving specks */}
      {dustParticles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.xStart}%`,
            bottom: "20%",
            width: p.size,
            height: p.size,
            backgroundColor: "rgba(167,139,250,0.15)",
            animation: `dust-drift ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}

      {/* Document particles — only when approvals are pending */}
      {docParticles.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.xStart}%`,
            bottom: "60%",
            animation: `doc-float ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        >
          {/* Paper icon — larger and more visible */}
          <svg width="14" height="16" viewBox="0 0 14 16" fill="none" style={{ opacity: 0.5 }}>
            <rect x="0" y="0" width="11" height="15" rx="1.5" fill={p.color} opacity="0.6" />
            <path d="M8 0 L11 3 L8 3 Z" fill={p.color} opacity="0.8" />
            <line x1="2.5" y1="5.5" x2="8" y2="5.5" stroke="white" strokeWidth="0.6" opacity="0.3" />
            <line x1="2.5" y1="8" x2="7" y2="8" stroke="white" strokeWidth="0.6" opacity="0.3" />
            <line x1="2.5" y1="10.5" x2="8" y2="10.5" stroke="white" strokeWidth="0.6" opacity="0.3" />
          </svg>
        </div>
      ))}

      <style>{`
        @keyframes doc-float {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
          15% { opacity: 0.6; }
          50% { transform: translate(20px, -150px) rotate(12deg); opacity: 0.35; }
          85% { opacity: 0.15; }
          100% { transform: translate(-10px, -250px) rotate(-8deg); opacity: 0; }
        }
        @keyframes dust-drift {
          0% { transform: translate(0, 0); opacity: 0; }
          20% { opacity: 0.4; }
          50% { transform: translate(15px, -60px); opacity: 0.25; }
          80% { opacity: 0.15; }
          100% { transform: translate(-5px, -120px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
