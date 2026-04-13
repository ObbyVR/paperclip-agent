import { ExternalLink } from "lucide-react";

interface OutputPreviewCardProps {
  name: string;
  openUrl?: string;
}

export function OutputPreviewCard({ name, openUrl }: OutputPreviewCardProps) {
  return (
    <div
      className="mt-2 cursor-pointer overflow-hidden rounded-lg border border-white/10 bg-[#1e2233] transition-colors hover:border-indigo-400/50"
      onClick={() => openUrl && window.open(openUrl, "_blank")}
    >
      <div className="flex h-[120px] items-center justify-center bg-gradient-to-br from-[#1a1040] to-[#0f2027]">
        <div className="flex w-[85%] h-[90%] flex-col items-center justify-center gap-1 rounded border border-white/[0.06] bg-[#111] text-[8px] text-white/45">
          <div className="h-1 w-[60%] rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300" />
          <div className="h-0.5 w-[40%] rounded-full bg-white/10" />
          <div className="h-0.5 w-[25%] rounded-full bg-white/10" />
        </div>
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-medium text-white/70">{name}</span>
        {openUrl && (
          <a href={openUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-[10px] font-medium text-indigo-400 hover:underline">
            Apri nel browser <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}
