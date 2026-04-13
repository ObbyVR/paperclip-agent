export function CeoNode() {
  return (
    <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
      <div className="absolute -inset-5 animate-[ring-breathe_4s_ease-in-out_infinite_1.5s] rounded-full border border-dashed border-indigo-400/[0.08]" />
      <div className="absolute -inset-2 animate-[ring-breathe_4s_ease-in-out_infinite] rounded-full border-[1.5px] border-indigo-400/[0.18]" />
      <div className="flex h-[64px] w-[64px] cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-[0_0_0_1px_rgba(129,140,248,0.15),0_0_40px_rgba(99,102,241,0.2)] transition-transform hover:scale-105">
        <span className="text-[24px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]">👔</span>
      </div>
      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45">You</span>
    </div>
  );
}
