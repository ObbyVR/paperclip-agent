// S43 — Telegram CEO Bot — service bindings
//
// This is the ONLY place the bot knows about concrete paperclip services.
// Command handlers receive a `BotServices` interface (defined here) so they
// can be unit-tested with plain stubs — no DB, no drizzle, no tx setup.
//
// The real wiring is in `index.ts` (`createLiveBindings(db)`), which imports
// the actual service factories and adapts them to this interface. Any future
// schema change that affects one of these methods will surface here as a
// single-file update.

export interface BotCompany {
  id: string;
  name: string;
  issuePrefix: string;
}

export interface BotAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  title: string | null;
}

export interface BotIssueSummary {
  id: string;
  identifier: string;
  title: string;
  status: string;
  assigneeAgentId: string | null;
  updatedAt: string | Date;
}

export interface BotIssueDetail extends BotIssueSummary {
  description: string | null;
  createdAt: string | Date;
}

export interface BotApproval {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  createdAt: string | Date;
}

export interface BotDashboardSummary {
  agents: { active: number; running: number; paused: number; error: number };
  tasks: { open: number; inProgress: number; blocked: number; done: number };
  costs: { monthSpendCents: number; monthBudgetCents: number; monthUtilizationPercent: number };
  pendingApprovals: number;
}

/**
 * Everything command handlers need from paperclip services.
 * Keep this interface minimal — each method must correspond to exactly one
 * call site in the handlers. Avoid "convenience" methods; if a handler needs
 * to compose, it composes itself.
 */
export interface BotServices {
  listCompanies(): Promise<BotCompany[]>;
  getCompany(companyId: string): Promise<BotCompany | null>;

  listAgents(companyId: string): Promise<BotAgent[]>;
  getAgent(agentId: string): Promise<BotAgent | null>;

  listActiveIssues(companyId: string, limit?: number): Promise<BotIssueSummary[]>;
  getIssueByIdentifier(companyId: string, identifier: string): Promise<BotIssueDetail | null>;
  createIssue(input: {
    companyId: string;
    title: string;
    description: string | null;
    assigneeAgentId: string;
    createdByUserId: string;
  }): Promise<BotIssueSummary>;

  listPendingApprovals(companyId: string): Promise<BotApproval[]>;
  approveApproval(id: string, userId: string, note: string | null): Promise<BotApproval>;
  rejectApproval(id: string, userId: string, note: string): Promise<BotApproval>;

  dashboardSummary(companyId: string): Promise<BotDashboardSummary>;
}
