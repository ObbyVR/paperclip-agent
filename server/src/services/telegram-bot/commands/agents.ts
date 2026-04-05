// S43 — Telegram CEO Bot — /agents, /setceo
import type { BotServices } from "../service-bindings.js";
import type { CommandResult, SessionState } from "../types.js";

export async function handleAgentsList(
  svc: BotServices,
  session: SessionState | undefined,
): Promise<CommandResult> {
  if (!session?.companyId) {
    return {
      text: "Seleziona prima una company con `/company <id>`.",
      parseMode: "Markdown",
      readonly: true,
    };
  }
  const agents = await svc.listAgents(session.companyId);
  if (agents.length === 0) {
    return { text: "Nessun agente in questa company.", readonly: true };
  }
  const lines = agents.map((a) => {
    const marker = session.ceoAgentId === a.id ? " 👑" : "";
    const title = a.title ? ` — ${a.title}` : "";
    return `• \`${a.id}\` — *${a.name}* (${a.role})${title} · _${a.status}_${marker}`;
  });
  return {
    text:
      `*Agenti (${agents.length}):*\n${lines.join("\n")}\n\n` +
      `Usa \`/setceo <agentId>\` per designare chi riceve i tuoi task.`,
    parseMode: "Markdown",
    readonly: true,
  };
}

export async function handleSetCeo(
  svc: BotServices,
  session: SessionState | undefined,
  rawArgs: string,
  upsert: (patch: Partial<SessionState>) => SessionState,
): Promise<CommandResult> {
  if (!session?.companyId) {
    return {
      text: "Seleziona prima una company con `/company <id>`.",
      parseMode: "Markdown",
      readonly: true,
    };
  }
  const agentId = rawArgs.trim();
  if (!agentId) {
    return { text: "Uso: `/setceo <agentId>`", parseMode: "Markdown", readonly: true };
  }
  const agent = await svc.getAgent(agentId);
  if (!agent) {
    return { text: `Agente \`${agentId}\` non trovato.`, parseMode: "Markdown", readonly: true };
  }
  upsert({ ceoAgentId: agent.id });
  return {
    text:
      `👑 Designato *${agent.name}* (${agent.role}) come destinatario dei tuoi task.\n\n` +
      `Ora puoi scrivermi liberamente o usare \`/task <testo>\`.`,
    parseMode: "Markdown",
  };
}
