import { cn } from "@/lib/utils";
import type { CortexStatus } from "@/lib/cortex-status";
import { cortexStatusStyles, cortexStatusIcon, cortexStatusPulses } from "@/lib/cortex-status";

interface AgentAvatarProps {
  name: string;
  status: CortexStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function dicebearUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=161a27`;
}

export function AgentAvatar({ name, status, size = "md", className }: AgentAvatarProps) {
  const s = cortexStatusStyles[status];
  const dotIcon = cortexStatusIcon(status);
  const pulses = cortexStatusPulses(status);
  const px = size === "sm" ? 34 : size === "lg" ? 46 : 56;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2",
        s.border, s.bg, s.glow,
        status === "idle" && "opacity-40",
        className,
      )}
      style={{ width: px, height: px }}
    >
      <img src={dicebearUrl(name)} alt={name} className="h-full w-full rounded-full object-cover" loading="lazy" />
      {status !== "idle" && (
        <div className={cn(
          "absolute -right-px -top-px flex h-4 w-4 items-center justify-center rounded-full border-[2.5px] border-[#060810]",
          s.dot, pulses && "animate-pulse",
        )}>
          {dotIcon && <span className="text-[7px] font-extrabold leading-none text-[#0b0d15]">{dotIcon}</span>}
        </div>
      )}
    </div>
  );
}
