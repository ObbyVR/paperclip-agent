import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Menu, Search } from "lucide-react";

interface KPI { value: string; label: string; hot?: boolean; }
interface BreadcrumbItem { label: string; onClick?: () => void; }
interface TopBarProps {
  title: string;
  chip?: string;
  kpis?: KPI[];
  modelTag?: string;
  className?: string;
  onBack?: () => void;
  onMenuOpen?: () => void;
  onSearchOpen?: () => void;
  breadcrumbs?: BreadcrumbItem[];
}

export function TopBar({ title, chip, kpis, modelTag, className, onBack, onMenuOpen, onSearchOpen, breadcrumbs }: TopBarProps) {
  return (
    <div className={cn("flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0b0d15] px-4 py-2.5 md:px-7", className)}>
      <div className="flex items-center gap-2">
        {/* Mobile hamburger */}
        {onMenuOpen && (
          <button
            onClick={onMenuOpen}
            className="mr-1 flex h-7 w-7 items-center justify-center rounded-md text-white/45 transition-all hover:bg-white/[0.06] hover:text-white md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        {onBack && (
          <button
            onClick={onBack}
            className="mr-1 flex h-6 w-6 items-center justify-center rounded-md text-white/45 transition-all hover:bg-white/[0.06] hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="hidden items-center gap-1 sm:flex">
            {breadcrumbs.map((bc, i) => (
              <span key={i} className="flex items-center gap-1">
                {bc.onClick ? (
                  <button onClick={bc.onClick} className="text-[13px] text-white/40 transition-colors hover:text-white/70">{bc.label}</button>
                ) : (
                  <span className="text-[13px] text-white/40">{bc.label}</span>
                )}
                <ChevronRight className="h-3 w-3 text-white/20" />
              </span>
            ))}
          </div>
        )}
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] md:text-[17px]">{title}</h2>
        {chip && <span className="hidden rounded-md bg-indigo-400/[0.12] px-2.5 py-0.5 text-[10.5px] font-medium text-indigo-400 sm:inline">{chip}</span>}
        {onSearchOpen && (
          <button
            onClick={onSearchOpen}
            className="ml-2 hidden items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] text-white/30 transition-all hover:border-white/10 hover:text-white/50 sm:flex"
          >
            <Search className="h-3 w-3" />
            <span>Cerca...</span>
            <kbd className="ml-1 rounded border border-white/[0.06] bg-white/[0.04] px-1 py-0.5 text-[9px] text-white/25">⌘K</kbd>
          </button>
        )}
      </div>
      {(kpis || modelTag) && (
        <div className="flex items-center gap-3 md:gap-5">
          {kpis?.map((k, i) => (
            <div key={i} className="flex items-center gap-[5px] text-[10px] text-white/45 md:text-[11.5px]">
              <span className={cn("font-medium font-mono text-[11px] md:text-[12px]", k.hot ? "text-[#fcd34d]" : "text-white/70")}>{k.value}</span>
              <span className="hidden sm:inline">{k.label}</span>
              {i < (kpis?.length ?? 0) - 1 && <div className="ml-2 h-3.5 w-px bg-white/[0.06] md:ml-4" />}
            </div>
          ))}
          {modelTag && (
            <>
              <div className="h-3.5 w-px bg-white/[0.06]" />
              <span className="hidden rounded border border-white/[0.06] bg-[#161a27] px-2 py-0.5 font-mono text-[10px] text-white/45 sm:inline">{modelTag}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
