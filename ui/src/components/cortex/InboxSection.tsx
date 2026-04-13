import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface InboxSectionProps {
  title: string;
  count?: number;
  color: string;
  muted?: boolean;
  children: React.ReactNode;
  /** Start collapsed (useful for archive on mobile) */
  defaultCollapsed?: boolean;
}

export function InboxSection({ title, count, color, muted, children, defaultCollapsed = false }: InboxSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={cn("px-4 md:px-7", muted && "opacity-40")}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 pb-2 pt-[18px] text-left"
      >
        <div className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: color }} />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color }}>{title}</h3>
        {count != null && <span className="font-mono text-[10.5px] text-white/45">{count}</span>}
        <ChevronDown
          className={cn("ml-auto h-3 w-3 text-white/25 transition-transform duration-150", collapsed && "-rotate-90")}
        />
      </button>
      {!collapsed && <div className="space-y-[5px]">{children}</div>}
    </div>
  );
}
