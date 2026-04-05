// S43 — Telegram CEO Bot — /companies, /company
import type { BotServices } from "../service-bindings.js";
import type { CommandResult, SessionState } from "../types.js";

export async function handleCompaniesList(svc: BotServices): Promise<CommandResult> {
  const companies = await svc.listCompanies();
  if (companies.length === 0) {
    return { text: "Nessuna company trovata nell'istanza.", readonly: true };
  }
  const lines = companies.map((c) => `• \`${c.id}\` — *${c.name}* (${c.issuePrefix})`);
  return {
    text: `*Companies (${companies.length}):*\n${lines.join("\n")}\n\nUsa \`/company <id>\` per selezionarne una.`,
    parseMode: "Markdown",
    readonly: true,
  };
}

export async function handleCompanySelect(
  svc: BotServices,
  rawArgs: string,
  chatId: string,
  userId: string,
  upsert: (patch: Partial<SessionState>) => SessionState,
): Promise<CommandResult> {
  const companyId = rawArgs.trim();
  if (!companyId) {
    return { text: "Uso: `/company <id>`", parseMode: "Markdown", readonly: true };
  }
  const company = await svc.getCompany(companyId);
  if (!company) {
    return { text: `Company \`${companyId}\` non trovata.`, parseMode: "Markdown", readonly: true };
  }
  // Switching company clears the ceoAgentId — the old agent belongs to a
  // different company and the founder should re-choose explicitly.
  upsert({ companyId: company.id, ceoAgentId: null });
  return {
    text:
      `✅ Company selezionata: *${company.name}* (${company.issuePrefix}).\n\n` +
      `Ora scegli il CEO: \`/agents\` → \`/setceo <agentId>\`.`,
    parseMode: "Markdown",
  };
}
