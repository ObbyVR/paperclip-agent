export type CortexStatus = "working" | "needs-me" | "done" | "error" | "idle";

export const cortexStatusStyles: Record<CortexStatus, {
  border: string;
  bg: string;
  dot: string;
  text: string;
  glow: string;
  lineClass: string;
}> = {
  working: {
    border: "border-[#67e8f9]",
    bg: "bg-[rgba(103,232,249,0.08)]",
    dot: "bg-[#67e8f9]",
    text: "text-[#67e8f9]",
    glow: "shadow-[0_0_16px_rgba(103,232,249,0.15)]",
    lineClass: "live",
  },
  "needs-me": {
    border: "border-[#fcd34d]",
    bg: "bg-[rgba(252,211,77,0.08)]",
    dot: "bg-[#fcd34d]",
    text: "text-[#fcd34d]",
    glow: "shadow-[0_0_16px_rgba(252,211,77,0.15)]",
    lineClass: "alert",
  },
  done: {
    border: "border-[#6ee7b7]",
    bg: "bg-[rgba(110,231,183,0.08)]",
    dot: "bg-[#6ee7b7]",
    text: "text-[#6ee7b7]",
    glow: "",
    lineClass: "done",
  },
  error: {
    border: "border-[#fca5a5]",
    bg: "bg-[rgba(252,165,165,0.08)]",
    dot: "bg-[#fca5a5]",
    text: "text-[#fca5a5]",
    glow: "shadow-[0_0_16px_rgba(252,165,165,0.15)]",
    lineClass: "error",
  },
  idle: {
    border: "border-white/10",
    bg: "bg-transparent",
    dot: "",
    text: "text-white/30",
    glow: "",
    lineClass: "idle",
  },
};

export function issueToV2Status(
  issueStatus: string,
  opts?: { isUnread?: boolean; hasLiveRun?: boolean },
): CortexStatus {
  if (opts?.hasLiveRun) return "working";
  switch (issueStatus) {
    case "blocked":
    case "in_review":
      return "needs-me";
    case "in_progress":
    case "todo":
      return "working";
    case "done":
      return opts?.isUnread ? "needs-me" : "done";
    case "cancelled":
      return "done";
    case "backlog":
    default:
      return "idle";
  }
}

export function cortexStatusIcon(status: CortexStatus): string | null {
  switch (status) {
    case "needs-me": return "!";
    case "done": return "✓";
    case "error": return "!";
    default: return null;
  }
}

export function cortexStatusPulses(status: CortexStatus): boolean {
  return status === "working" || status === "error";
}
