import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";

interface KPI { value: string; label: string; hot?: boolean; }
interface TopBarProps {
  title: string;
  chip?: string;
  kpis?: KPI[];
  modelTag?: string;
  className?: string;
  onBack?: () => void;
}

export function TopBar({ title, chip, kpis, modelTag, className, onBack }: TopBarProps) {
  return (
    <div className={cn("flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0b0d15] px-7 py-2.5", className)}>
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="mr-1 flex h-6 w-6 items-center justify-center rounded-md text-white/45 transition-all hover:bg-white/[0.06] hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
        {chip && <span className="rounded-md bg-indigo-400/[0.12] px-2.5 py-0.5 text-[10.5px] font-medium text-indigo-400">{chip}</span>}
      </div>
      {(kpis || modelTag) && (
        <div className="flex items-center gap-5">
          {kpis?.map((k, i) => (
            <div key={i} className="flex items-center gap-[5px] text-[11.5px] text-white/45">
              <span className={cn("font-medium font-mono text-[12px]", k.hot ? "text-[#fcd34d]" : "text-white/70")}>{k.value}</span>
              {k.label}
              {i < (kpis?.length ?? 0) - 1 && <div className="ml-4 h-3.5 w-px bg-white/[0.06]" />}
            </div>
          ))}
          {modelTag && (
            <>
              <div className="h-3.5 w-px bg-white/[0.06]" />
              <span className="rounded border border-white/[0.06] bg-[#161a27] px-2 py-0.5 font-mono text-[10px] text-white/45">{modelTag}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
