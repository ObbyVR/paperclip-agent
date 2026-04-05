// S43 — Telegram CEO Bot — dispatcher + parseCommand tests
import { describe, expect, it, vi } from "vitest";
import { Dispatcher, parseCommand } from "../../services/telegram-bot/dispatcher.js";
import { SessionStore } from "../../services/telegram-bot/session-store.js";
import type { BotServices } from "../../services/telegram-bot/service-bindings.js";
import type { TelegramTransport } from "../../services/telegram-bot/transport.js";
import type { TgUpdate } from "../../services/telegram-bot/types.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

describe("parseCommand", () => {
  it("extracts /command and args", () => {
    expect(parseCommand("/task hello world")).toEqual({ command: "/task", args: "hello world" });
  });

  it("returns null command for free-form text", () => {
    expect(parseCommand("just some text")).toEqual({ command: null, args: "just some text" });
  });

  it("strips @botname suffix", () => {
    expect(parseCommand("/help@PaperclipBot")).toEqual({ command: "/help", args: "" });
  });

  it("lowercases the command", () => {
    expect(parseCommand("/TASK foo")).toEqual({ command: "/task", args: "foo" });
  });

  it("handles leading whitespace", () => {
    expect(parseCommand("  /start")).toEqual({ command: "/start", args: "" });
  });

  it("preserves args with newlines", () => {
    expect(parseCommand("/task line1\nline2")).toEqual({ command: "/task", args: "line1\nline2" });
  });
});

// -----------------------------------------------------------------------------
// Dispatcher integration (transport mocked, services stubbed, store in-memory)
// -----------------------------------------------------------------------------

interface MockTransport {
  sent: Array<{ chatId: number | string; text: string }>;
  edited: Array<{ chatId: number | string; messageId: number; text: string }>;
  answered: string[];
}

function makeMockTransport(): { transport: TelegramTransport; state: MockTransport } {
  const state: MockTransport = { sent: [], edited: [], answered: [] };
  const transport = {
    sendMessage: vi.fn(async (chatId: number | string, text: string) => {
      state.sent.push({ chatId, text });
    }),
    editMessageText: vi.fn(async (chatId: number | string, messageId: number, text: string) => {
      state.edited.push({ chatId, messageId, text });
    }),
    answerCallbackQuery: vi.fn(async (id: string) => {
      state.answered.push(id);
    }),
    getUpdates: vi.fn(async () => []),
    setMyCommands: vi.fn(async () => void 0),
    getMe: vi.fn(async () => ({ id: 1, is_bot: true })),
  } as unknown as TelegramTransport;
  return { transport, state };
}

function makeStubServices(overrides: Partial<BotServices> = {}): BotServices {
  const base: BotServices = {
    listCompanies: vi.fn(async () => [
      { id: "co-1", name: "Acme", issuePrefix: "ACM" },
    ]),
    getCompany: vi.fn(async (id: string) =>
      id === "co-1" ? { id: "co-1", name: "Acme", issuePrefix: "ACM" } : null,
    ),
    listAgents: vi.fn(async () => [
      { id: "a1", name: "Alice", role: "ceo", status: "idle", title: "CEO" },
    ]),
    getAgent: vi.fn(async (id: string) =>
      id === "a1" ? { id: "a1", name: "Alice", role: "ceo", status: "idle", title: "CEO" } : null,
    ),
    listActiveIssues: vi.fn(async () => []),
    getIssueByIdentifier: vi.fn(async () => null),
    createIssue: vi.fn(async (input) => ({
      id: "i1",
      identifier: "ACM-1",
      title: input.title,
      status: "open",
      assigneeAgentId: input.assigneeAgentId,
      updatedAt: new Date().toISOString(),
    })),
    listPendingApprovals: vi.fn(async () => []),
    approveApproval: vi.fn(async (id) => ({
      id,
      type: "hire_agent",
      status: "approved",
      payload: {},
      createdAt: new Date().toISOString(),
    })),
    rejectApproval: vi.fn(async (id) => ({
      id,
      type: "hire_agent",
      status: "rejected",
      payload: {},
      createdAt: new Date().toISOString(),
    })),
    dashboardSummary: vi.fn(async () => ({
      agents: { active: 1, running: 0, paused: 0, error: 0 },
      tasks: { open: 2, inProgress: 1, blocked: 0, done: 5 },
      costs: { monthSpendCents: 1000, monthBudgetCents: 5000, monthUtilizationPercent: 20 },
      pendingApprovals: 3,
    })),
  };
  return { ...base, ...overrides };
}

async function makeStore(): Promise<SessionStore> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tgb-disp-"));
  const store = new SessionStore({ filePath: path.join(tmp, "s.json"), debounceMs: 0 });
  await store.load();
  return store;
}

function privateMessage(chatId: number, text: string, updateId = 1): TgUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: 10,
      from: { id: chatId },
      chat: { id: chatId, type: "private" },
      date: Date.now(),
      text,
    },
  };
}

describe("Dispatcher.handle", () => {
  it("rejects unauthorized chat_id with an unauthorized message", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [],
      skipConfirm: false,
    });
    await d.handle(privateMessage(42, "/help"));
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].text).toContain("non autorizzata");
  });

  it("ignores messages from non-private chats silently", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u" }],
      skipConfirm: false,
    });
    const update: TgUpdate = {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 42, type: "group" },
        date: Date.now(),
        text: "/help",
      },
    };
    await d.handle(update);
    expect(state.sent).toHaveLength(0);
  });

  it("routes /start without a session to the onboarding message", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u" }],
      skipConfirm: false,
    });
    await d.handle(privateMessage(42, "/start"));
    expect(state.sent[0].text).toContain("Benvenuto");
  });

  it("routes /companies to the list handler", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u" }],
      skipConfirm: false,
    });
    await d.handle(privateMessage(42, "/companies"));
    expect(svc.listCompanies).toHaveBeenCalled();
    expect(state.sent[0].text).toContain("Acme");
  });

  it("onboarding flow: /company sets session.companyId", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u" }],
      skipConfirm: false,
    });
    await d.handle(privateMessage(42, "/company co-1"));
    expect(store.get("42")?.companyId).toBe("co-1");
    expect(state.sent[0].text).toContain("Acme");
  });

  it("full setup then /task creates issue with ceoAgentId", async () => {
    const { transport } = makeMockTransport();
    const store = await makeStore();
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u-42" }],
      skipConfirm: false,
    });
    await d.handle(privateMessage(42, "/company co-1", 1));
    await d.handle(privateMessage(42, "/setceo a1", 2));
    await d.handle(privateMessage(42, "/task Scrivi un report trimestrale\nCon focus sui costi", 3));
    expect(svc.createIssue).toHaveBeenCalledWith({
      companyId: "co-1",
      title: "Scrivi un report trimestrale",
      description: "Con focus sui costi",
      assigneeAgentId: "a1",
    });
  });

  it("free-form message (no /) is treated as /task", async () => {
    const { transport } = makeMockTransport();
    const store = await makeStore();
    store.upsert("42", "u", { companyId: "co-1", ceoAgentId: "a1" });
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u" }],
      skipConfirm: false,
    });
    await d.handle(privateMessage(42, "Organizza call con il team"));
    expect(svc.createIssue).toHaveBeenCalled();
    expect((svc.createIssue as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toMatchObject({
      title: "Organizza call con il team",
    });
  });

  it("/task without a company returns onboarding prompt", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u" }],
      skipConfirm: false,
    });
    await d.handle(privateMessage(42, "/task do something"));
    expect(svc.createIssue).not.toHaveBeenCalled();
    expect(state.sent[0].text).toContain("Seleziona prima una company");
  });

  it("/approve without args shows usage", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    store.upsert("42", "u", { companyId: "co-1", ceoAgentId: "a1" });
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u" }],
      skipConfirm: false,
    });
    await d.handle(privateMessage(42, "/approve"));
    expect(svc.approveApproval).not.toHaveBeenCalled();
    expect(state.sent[0].text).toContain("Uso");
  });

  it("/approve with args shows confirm keyboard (skipConfirm=false)", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    store.upsert("42", "u", { companyId: "co-1", ceoAgentId: "a1" });
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u" }],
      skipConfirm: false,
    });
    await d.handle(privateMessage(42, "/approve app-123 looks good"));
    expect(svc.approveApproval).not.toHaveBeenCalled(); // not yet — waiting for confirm
    expect(state.sent[0].text).toContain("Confermi");
  });

  it("/approve with args executes immediately when skipConfirm=true", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    store.upsert("42", "u", { companyId: "co-1", ceoAgentId: "a1" });
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u-42" }],
      skipConfirm: true,
    });
    await d.handle(privateMessage(42, "/approve app-123 ok"));
    expect(svc.approveApproval).toHaveBeenCalledWith("app-123", "u-42", "ok");
    expect(state.sent[state.sent.length - 1].text).toContain("approved");
  });

  it("/reject requires a reason", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    store.upsert("42", "u", { companyId: "co-1", ceoAgentId: "a1" });
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u" }],
      skipConfirm: true,
    });
    await d.handle(privateMessage(42, "/reject app-123"));
    expect(svc.rejectApproval).not.toHaveBeenCalled();
    expect(state.sent[0].text).toContain("motivo");
  });

  it("unknown command returns a friendly error", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u" }],
      skipConfirm: false,
    });
    await d.handle(privateMessage(42, "/nosuch"));
    expect(state.sent[0].text).toContain("sconosciuto");
  });

  it("callback_query tgb:approve:ID executes approval", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    store.upsert("42", "u-42", { companyId: "co-1" });
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u-42" }],
      skipConfirm: false,
    });
    const update: TgUpdate = {
      update_id: 1,
      callback_query: {
        id: "cb-1",
        from: { id: 42 },
        message: { message_id: 99, chat: { id: 42, type: "private" }, date: 0 },
        data: "tgb:approve:app-xyz",
      },
    };
    await d.handle(update);
    expect(svc.approveApproval).toHaveBeenCalledWith("app-xyz", "u-42", null);
    expect(state.edited[0].text).toContain("approved");
    expect(state.answered).toContain("cb-1");
  });

  it("callback_query tgb:cancel edits to 'Annullato'", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    const svc = makeStubServices();
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u-42" }],
      skipConfirm: false,
    });
    const update: TgUpdate = {
      update_id: 1,
      callback_query: {
        id: "cb-2",
        from: { id: 42 },
        message: { message_id: 88, chat: { id: 42, type: "private" }, date: 0 },
        data: "tgb:cancel:app-1",
      },
    };
    await d.handle(update);
    expect(svc.approveApproval).not.toHaveBeenCalled();
    expect(state.edited[0].text).toContain("Annullato");
  });

  it("service error in /task is surfaced as a friendly message", async () => {
    const { transport, state } = makeMockTransport();
    const store = await makeStore();
    store.upsert("42", "u", { companyId: "co-1", ceoAgentId: "a1" });
    const svc = makeStubServices({
      createIssue: vi.fn(async () => {
        throw new Error("quota exceeded");
      }),
    });
    const d = new Dispatcher({
      transport,
      store,
      svc,
      allowlist: [{ chatId: "42", userId: "u" }],
      skipConfirm: false,
    });
    await d.handle(privateMessage(42, "Crea report"));
    expect(state.sent[0].text).toContain("quota exceeded");
  });
});
