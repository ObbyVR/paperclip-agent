import { ExternalLink, Download } from "lucide-react";

export interface MaskFile {
  icon: string;
  name: string;
  meta: string;
  time: string;
  action: "open" | "download";
  href?: string;
}

interface MaskFilesProps { files: MaskFile[]; }

export function MaskFiles({ files }: MaskFilesProps) {
  if (files.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/35">
        <span className="text-[32px]">📁</span>
        <span className="text-[12px]">Nessun file allegato</span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-5 py-4">
      {files.map((f, i) => (
        <a key={i} href={f.href ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-[#161a27] px-3 py-2.5 transition-all hover:border-white/10 hover:bg-[#1e2233]">
          <span className="shrink-0 text-xl">{f.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-medium">{f.name}</div>
            <div className="mt-0.5 flex gap-2 text-[10px] text-white/45"><span>{f.meta}</span><span>{f.time}</span></div>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-indigo-400/[0.12] px-2.5 py-1 text-[10px] font-medium text-indigo-400 transition-all hover:bg-indigo-400/[0.12]">
            {f.action === "open" ? <>Apri <ExternalLink className="h-2.5 w-2.5" /></> : <>Scarica <Download className="h-2.5 w-2.5" /></>}
          </div>
        </a>
      ))}
    </div>
  );
}
