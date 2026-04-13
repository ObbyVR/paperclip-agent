import { useEffect } from "react";
import { X } from "lucide-react";

interface KeyboardHelpProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { section: "Navigazione", items: [
    { keys: "⌘ K", desc: "Apri command palette" },
    { keys: "?", desc: "Mostra scorciatoie" },
    { keys: "Esc", desc: "Chiudi pannello / modale" },
  ]},
  { section: "Issues", items: [
    { keys: "Click", desc: "Apri pannello laterale" },
    { keys: "Doppio click", desc: "Apri pagina dettaglio" },
    { keys: "Click su stato", desc: "Cambio rapido stato" },
    { keys: "Drag", desc: "Riordina priorità" },
  ]},
  { section: "Grafo", items: [
    { keys: "Scroll", desc: "Zoom in/out" },
    { keys: "Drag sfondo", desc: "Pan" },
    { keys: "Pinch", desc: "Zoom touch" },
    { keys: "Click nodo", desc: "Drill-in / apri mask" },
  ]},
];

export function KeyboardHelp({ open, onClose }: KeyboardHelpProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[101] w-[90vw] max-w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-white/[0.08] bg-[#10131d] shadow-[0_24px_80px_rgba(0,0,0,0.7)]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <h2 className="text-[14px] font-semibold">Scorciatoie tastiera</h2>
          <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded-md text-white/45 hover:bg-white/[0.06] hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {SHORTCUTS.map((section) => (
            <div key={section.section} className="mb-4 last:mb-0">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30">{section.section}</h3>
              {section.items.map((item) => (
                <div key={item.keys} className="flex items-center justify-between py-1.5">
                  <span className="text-[12px] text-white/60">{item.desc}</span>
                  <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-white/50">{item.keys}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
