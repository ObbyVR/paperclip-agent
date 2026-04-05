// S43 — Telegram CEO Bot — /start, /help
import type { CommandResult } from "../types.js";

const COMMANDS_HELP = `Paperclip CEO bot — comandi disponibili:

📋 *Setup*
/companies — lista company
/company <id> — seleziona company
/agents — lista agenti della company
/setceo <agentId> — designa chi riceve i tuoi task
/whoami — mostra configurazione corrente

✉️ *Task*
/task <testo> — crea issue per il CEO
(messaggio libero = /task)

📊 *Stato*
/status — dashboard summary
/issues — issue attive
/issue <IDENTIFIER> — dettaglio issue

✅ *Approvals*
/approvals — pending
/approve <id> [nota]
/reject <id> <motivo>

🔔 *Notifiche*
/notify <key> on|off
keys: approvalsPending, runFailed, issueErrored, agentHired,
      agentReplied, approvalResolved, budgetAlert, agentLifecycle,
      issueUnsuspended, hireFailed
/digest on|off — raggruppa le risposte agente in un unico messaggio

/help — questo messaggio`;

export function handleHelp(): CommandResult {
  return { text: COMMANDS_HELP, parseMode: "Markdown", readonly: true };
}

export function handleStart(hasSession: boolean): CommandResult {
  if (hasSession) return handleHelp();
  return {
    text:
      "Benvenuto in Paperclip CEO bot 👋\n\n" +
      "Prima di iniziare, configura la sessione:\n" +
      "1. /companies per vedere le company\n" +
      "2. /company <id> per selezionarne una\n" +
      "3. /agents per vedere gli agenti\n" +
      "4. /setceo <agentId> per designare chi riceve i tuoi task\n\n" +
      "Dopo potrai scrivermi liberamente (o usare /task).\n" +
      "/help per la lista completa dei comandi.",
    readonly: true,
  };
}
