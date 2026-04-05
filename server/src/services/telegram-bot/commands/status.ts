// S43 — Telegram CEO Bot — /status, /issues, /issue
import type { BotServices } from "../service-bindings.js";
import type { CommandResult, SessionState } from "../types.js";

function requireCompany(session: SessionState | undefined): CommandResult | null {
  if (session?.companyId) return null;
  return {
    text: "Seleziona prima una company con `/company <id>`.",
    parseMode: "Markdown",
    readonly: true,
  };
}

function formatEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

export async function handleStatus(
  svc: BotServices,
  session: SessionState | undefined,
): Promise<CommandResult> {
  const guard = requireCompany(session);
  if (guard) return guard;
  const s = await svc.dashboardSummary(session!.companyId!);
  const text =
    `📊 *Stato company*\n\n` +
    `🤖 Agenti: ${s.agents.active} active · ${s.agents.running} running · ` +
    `${s.agents.paused} paused · ${s.agents.error} error\n` +
    `📋 Task: ${s.tasks.open} open · ${s.tasks.inProgress} in-progress · ` +
    `${s.tasks.blocked} blocked · ${s.tasks.done} done\n` +
    `💰 Spesa mese: ${formatEur(s.costs.monthSpendCents)} / ${formatEur(s.costs.monthBudgetCents)} ` +
    `(${s.costs.monthUtilizationPercent}%)\n` +
    `⏳ Approvals pending: ${s.pendingApprovals}`;
  return { text, parseMode: "Markdown", readonly: true };
}

export async function handleIssuesList(
  svc: BotServices,
  session: SessionState | undefined,
): Promise<CommandResult> {
  const guard = requireCompany(session);
  if (guard) return guard;
  const issues = await svc.listActiveIssues(session!.companyId!, 10);
  if (issues.length === 0) {
    return { text: "Nessuna issue attiva. 🎉", readonly: true };
  }
  const lines = issues.map((i) => `• *${i.identifier}* _(${i.status})_ — ${i.title}`);
  return {
    text: `*Issue attive (${issues.length}):*\n${lines.join("\n")}`,
    parseMode: "Markdown",
    readonly: true,
  };
}

export async function handleIssueDetail(
  svc: BotServices,
  session: SessionState | undefined,
  rawArgs: string,
): Promise<CommandResult> {
  const guard = requireCompany(session);
  if (guard) return guard;
  const identifier = rawArgs.trim();
  if (!identifier) {
    return { text: "Uso: `/issue <IDENTIFIER>` (es. ACME-42)", parseMode: "Markdown", readonly: true };
  }
  const issue = await svc.getIssueByIdentifier(session!.companyId!, identifier);
  if (!issue) {
    return { text: `Issue \`${identifier}\` non trovata.`, parseMode: "Markdown", readonly: true };
  }
  const desc = issue.description ? `\n\n${issue.description}` : "";
  return {
    text:
      `*${issue.identifier}* _(${issue.status})_\n` +
      `${issue.title}${desc}\n\n` +
      `assignee: \`${issue.assigneeAgentId ?? "—"}\``,
    parseMode: "Markdown",
    readonly: true,
  };
}
