import { cn } from "../lib/utils";
import type { InboxItemCategory } from "../lib/inbox";
import { Bell, MessageSquare, RefreshCw } from "lucide-react";

const categoryConfig: Record<InboxItemCategory, { label: string; className: string; Icon: typeof Bell }> = {
  richiesta: {
    label: "Richiesta",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    Icon: Bell,
  },
  messaggio: {
    label: "Messaggio",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    Icon: MessageSquare,
  },
  aggiornamento: {
    label: "Aggiornamento",
    className: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
    Icon: RefreshCw,
  },
};

export function CategoryBadge({ category, className }: { category: InboxItemCategory; className?: string }) {
  const config = categoryConfig[category];
  const { Icon } = config;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
      config.className,
      className,
    )}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </span>
  );
}
