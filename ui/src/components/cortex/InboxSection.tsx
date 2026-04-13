import { cn } from "@/lib/utils";

interface InboxSectionProps {
  title: string;
  count?: number;
  color: string;
  muted?: boolean;
  children: React.ReactNode;
}

export function InboxSection({ title, count, color, muted, children }: InboxSectionProps) {
  return (
    <div className={cn("px-7", muted && "opacity-40")}>
      <div className="flex items-center gap-2 pb-2 pt-[18px]">
        <div className="h-[5px] w-[5px] rounded-full" style={{ background: color }} />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color }}>{title}</h3>
        {count != null && <span className="font-mono text-[10.5px] text-white/45">{count}</span>}
      </div>
      <div className="space-y-[5px]">{children}</div>
    </div>
  );
}
