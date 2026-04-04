import { useState, useRef, useEffect } from "react";
import { cn } from "../lib/utils";
import { AI_TIERS, type AiTierKey } from "../lib/aiTiers";

interface AiTierSelectorProps {
  value: AiTierKey;
  onChange: (tier: AiTierKey) => void;
  size?: "sm" | "default";
}

const TIER_COLORS: Record<AiTierKey, { active: string; dot: string }> = {
  estremo: { active: "bg-purple-500/20 text-purple-300 border-purple-500/40", dot: "bg-purple-500" },
  alto: { active: "bg-orange-500/20 text-orange-300 border-orange-500/40", dot: "bg-orange-500" },
  bilanciato: { active: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40", dot: "bg-cyan-500" },
  basso: { active: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", dot: "bg-emerald-500" },
  custom: { active: "bg-white/10 text-white/80 border-white/20", dot: "bg-white/50" },
};

export function AiTierSelector({ value, onChange, size = "default" }: AiTierSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = AI_TIERS.find((t) => t.key === value) ?? AI_TIERS[2];
  const colors = TIER_COLORS[value];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border transition-colors",
          colors.active,
          size === "sm"
            ? "px-2 py-1 text-[10px]"
            : "px-2.5 py-1 text-xs",
        )}
      >
        <span className={cn("h-2 w-2 rounded-full shrink-0", colors.dot)} />
        <span className="font-medium">{current.icon} {current.label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Livello AI
            </span>
          </div>
          {AI_TIERS.map((tier) => {
            const tc = TIER_COLORS[tier.key];
            const isActive = tier.key === value;
            return (
              <button
                key={tier.key}
                type="button"
                onClick={() => { onChange(tier.key); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  "hover:bg-white/5",
                  isActive && "bg-white/[0.03]",
                )}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", tc.dot)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">
                      {tier.icon} {tier.label}
                    </span>
                    {tier.costLabel && (
                      <span className="text-[10px] text-muted-foreground">{tier.costLabel}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{tier.description}</span>
                </div>
                {isActive && (
                  <span className="text-[10px] text-cyan-400 shrink-0">●</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
