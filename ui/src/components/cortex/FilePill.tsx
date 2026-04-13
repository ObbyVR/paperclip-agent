interface FilePillProps {
  icon?: string;
  name: string;
  size?: string;
  href?: string;
}

export function FilePill({ icon = "📄", name, size, href }: FilePillProps) {
  return (
    <a href={href ?? "#"} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-[#1e2233] px-2.5 py-1.5 text-[11px] transition-colors hover:border-white/[0.12]">
      <span>{icon}</span>
      <span className="font-medium text-white/70">{name}</span>
      {size && <span className="text-[9px] text-white/30">{size}</span>}
    </a>
  );
}
