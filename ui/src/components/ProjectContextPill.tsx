import { Link } from "@/lib/router";
import { Folder } from "lucide-react";
import { cn } from "../lib/utils";

export function ProjectContextPill({
  projectName,
  projectId,
  className,
}: {
  projectName: string | null;
  projectId: string | null;
  className?: string;
}) {
  if (!projectName) return null;

  const content = (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground",
      projectId && "hover:bg-accent hover:text-foreground transition-colors cursor-pointer",
      className,
    )}>
      <Folder className="h-2.5 w-2.5" />
      <span className="max-w-[120px] truncate">{projectName}</span>
    </span>
  );

  if (projectId) {
    return (
      <Link to={`/projects/${projectId}`} className="no-underline text-inherit">
        {content}
      </Link>
    );
  }

  return content;
}
