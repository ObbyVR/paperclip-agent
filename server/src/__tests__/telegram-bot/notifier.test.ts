// S43 — Telegram CEO Bot — notifier tests
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  classifyEvent,
  Notifier,
  type LiveEventLike,
  type SubscribeCompanyLiveEvents,
} from "../../services/telegram-bot/notifier.js";
import { SessionStore } from "../../services/telegram-bot/session-store.js";
import type { TelegramTransport } from "../../services/telegram-bot/transport.js";

describe("classifyEvent", () => {
  it("classifies heartbeat.run.status failed → runFailed", () => {
    const m = classifyEvent({
      type: "heartbeat.run.status",
      payload: { status: "failed", agentName: "Alice" },
    });
    expect(m?.key).toBe("runFailed");
    expect(m?.text).toContain("Alice");
  });

  it("ignores heartbeat.run.status with non-failed status", () => {
    expect(
      classifyEvent({ type: "heartbeat.run.status", payload: { status: "succeeded" } }),
    ).toBeNull();
  });

  it("classifies activity.logged action=approval.created", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: { action: "approval.created" },
    });
    expect(m?.key).toBe("approvalsPending");
  });

  it("classifies activity.logged action=issue.errored", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: {
        action: "issue.errored",
        actorType: "system",
        entityType: "issue",
        entityId: "iss-1",
        details: { identifier: "ACM-7" },
      },
    });
    expect(m?.key).toBe("issueErrored");
    expect(m?.text).toContain("ACM-7");
  });

  it("classifies activity.logged action=agent.created", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: { action: "agent.created", details: { name: "Bob" } },
    });
    expect(m?.key).toBe("agentHired");
    expect(m?.text).toContain("Bob");
  });

  it("classifies issue.comment_added by agent → agentReplied + ownerCheck", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: {
        action: "issue.comment_added",
        actorType: "agent",
        entityType: "issue",
        entityId: "iss-42",
        details: {
          identifier: "WEB-157",
          issueTitle: "Test task",
          bodySnippet: "Completato, ecco il report…",
        },
      },
    });
    expect(m?.key).toBe("agentReplied");
    expect(m?.ownerCheckIssueId).toBe("iss-42");
    expect(m?.text).toContain("WEB-157");
    expect(m?.text).toContain("Completato");
  });

  it("ignores issue.comment_added when actorType=user (founder's own comment)", () => {
    expect(
      classifyEvent({
        type: "activity.logged",
        payload: {
          action: "issue.comment_added",
          actorType: "user",
          entityType: "issue",
          entityId: "iss-42",
          details: { identifier: "WEB-157", bodySnippet: "note mine" },
        },
      }),
    ).toBeNull();
  });

  it("classifies issue.updated status=done by agent → agentReplied", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: {
        action: "issue.updated",
        actorType: "agent",
        entityType: "issue",
        entityId: "iss-42",
        details: { identifier: "WEB-157", status: "done", issueTitle: "Test task" },
      },
    });
    expect(m?.key).toBe("agentReplied");
    expect(m?.ownerCheckIssueId).toBe("iss-42");
    expect(m?.text).toContain("completata");
  });

  it("ignores issue.updated when status is not done", () => {
    expect(
      classifyEvent({
        type: "activity.logged",
        payload: {
          action: "issue.updated",
          actorType: "agent",
          entityType: "issue",
          entityId: "iss-42",
          details: { status: "in_progress" },
        },
      }),
    ).toBeNull();
  });

  it("truncates long comment snippets in the notification", () => {
    const long = "x".repeat(500);
    const m = classifyEvent({
      type: "activity.logged",
      payload: {
        action: "issue.comment_added",
        actorType: "agent",
        entityType: "issue",
        entityId: "iss-1",
        details: { identifier: "WEB-1", bodySnippet: long },
      },
    });
    expect(m?.text.length).toBeLessThan(400);
    expect(m?.text).toContain("…");
  });

  it("returns null for unrelated events", () => {
    expect(classifyEvent({ type: "plugin.ui.updated" })).toBeNull();
    expect(
      classifyEvent({ type: "activity.logged", payload: { action: "something.else" } }),
    ).toBeNull();
  });

  // S43-3 — extended notification types

  it("classifies approval.approved → approvalResolved + skipIfActorIs", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: {
        action: "approval.approved",
        actorType: "user",
        actorId: "user-founder",
        entityType: "approval",
        entityId: "app-1",
        details: { type: "hire_agent" },
      },
    });
    expect(m?.key).toBe("approvalResolved");
    expect(m?.skipIfActorIs).toBe("user-founder");
    expect(m?.text).toContain("approvata");
  });

  it("classifies approval.rejected with correct verb", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: {
        action: "approval.rejected",
        actorType: "user",
        actorId: "user-other",
        entityId: "app-2",
        details: { type: "hire_agent" },
      },
    });
    expect(m?.key).toBe("approvalResolved");
    expect(m?.text).toContain("rifiutata");
  });

  it("classifies approval.revision_requested", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: {
        action: "approval.revision_requested",
        actorType: "user",
        actorId: "user-other",
        entityId: "app-3",
        details: { type: "spend_increase" },
      },
    });
    expect(m?.text).toContain("revisione");
  });

  it("classifies budget.hard_threshold_crossed → budgetAlert", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: {
        action: "budget.hard_threshold_crossed",
        actorType: "system",
        details: { scopeType: "company" },
      },
    });
    expect(m?.key).toBe("budgetAlert");
    expect(m?.text).toContain("hard");
  });

  it("classifies budget.soft_threshold_crossed → budgetAlert", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: {
        action: "budget.soft_threshold_crossed",
        actorType: "system",
        details: { scopeType: "agent" },
      },
    });
    expect(m?.key).toBe("budgetAlert");
    expect(m?.text).toContain("soft");
  });

  it("classifies budget.incident_resolved → budgetAlert", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: { action: "budget.incident_resolved", actorType: "system" },
    });
    expect(m?.key).toBe("budgetAlert");
    expect(m?.text).toContain("risolto");
  });

  it("classifies agent.paused → agentLifecycle + skipIfActorIs", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: {
        action: "agent.paused",
        actorType: "user",
        actorId: "user-founder",
        details: { name: "Marco", pauseReason: "manual" },
      },
    });
    expect(m?.key).toBe("agentLifecycle");
    expect(m?.skipIfActorIs).toBe("user-founder");
    expect(m?.text).toContain("Marco");
    expect(m?.text).toContain("manual");
  });

  it("classifies agent.terminated → agentLifecycle", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: {
        action: "agent.terminated",
        actorType: "user",
        actorId: "user-founder",
        details: { name: "Alice" },
      },
    });
    expect(m?.key).toBe("agentLifecycle");
    expect(m?.text).toContain("terminato");
  });

  it("classifies issue.suspend_expired → issueUnsuspended", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: {
        action: "issue.suspend_expired",
        actorType: "system",
        entityType: "issue",
        entityId: "iss-42",
        details: { identifier: "WEB-42" },
      },
    });
    expect(m?.key).toBe("issueUnsuspended");
    expect(m?.text).toContain("WEB-42");
  });

  it("classifies hire_hook.failed → hireFailed", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: {
        action: "hire_hook.failed",
        actorType: "system",
        details: { name: "Bob", error: "kaboom" },
      },
    });
    expect(m?.key).toBe("hireFailed");
    expect(m?.text).toContain("Bob");
    expect(m?.text).toContain("kaboom");
  });
});

async function makeNotifierFixture() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tgb-notify-"));
  const store = new SessionStore({ filePath: path.join(tmp, "s.json"), debounceMs: 0 });
  await store.load();
  const sent: Array<{ chatId: string | number; text: string }> = [];
  const transport = {
    sendMessage: vi.fn(async (chatId: string | number, text: string) => {
      sent.push({ chatId, text });
    }),
  } as unknown as TelegramTransport;
  const subscribers = new Map<string, Array<(e: LiveEventLike) => void>>();
  const subscribe: SubscribeCompanyLiveEvents = (companyId, listener) => {
    if (!subscribers.has(companyId)) subscribers.set(companyId, []);
    subscribers.get(companyId)!.push(listener);
    return () => {
      const arr = subscribers.get(companyId) ?? [];
      const idx = arr.indexOf(listener);
      if (idx >= 0) arr.splice(idx, 1);
    };
  };
  const emit = (companyId: string, event: LiveEventLike) => {
    for (const l of subscribers.get(companyId) ?? []) l(event);
  };
  return { store, transport, sent, subscribe, emit, subscribers };
}

describe("Notifier", () => {
  it("does not subscribe sessions without companyId", async () => {
    const { store, transport, subscribe, subscribers } = await makeNotifierFixture();
    store.upsert("1", "u", {});
    const n = new Notifier({ transport, store, subscribeCompanyLiveEvents: subscribe });
    n.start();
    expect(subscribers.size).toBe(0);
  });

  it("subscribes sessions with companyId on start and forwards events", async () => {
    const { store, transport, sent, subscribe, emit } = await makeNotifierFixture();
    store.upsert("1", "u", { companyId: "co-1" });
    const n = new Notifier({ transport, store, subscribeCompanyLiveEvents: subscribe });
    n.start();
    emit("co-1", { type: "heartbeat.run.status", payload: { status: "failed", agentName: "Zoe" } });
    // Listener is synchronous but sendMessage is awaited inside a floating
    // promise — give the microtask queue a tick to flush.
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("Zoe");
  });

  it("respects notifyOn[key] = false", async () => {
    const { store, transport, sent, subscribe, emit } = await makeNotifierFixture();
    store.upsert("1", "u", {
      companyId: "co-1",
      notifyOn: {
        approvalsPending: true,
        runFailed: false,
        issueErrored: true,
        agentHired: true,
        agentReplied: true,
        approvalResolved: true,
        budgetAlert: true,
        agentLifecycle: true,
        issueUnsuspended: true,
        hireFailed: true,
      },
    });
    const n = new Notifier({ transport, store, subscribeCompanyLiveEvents: subscribe });
    n.start();
    emit("co-1", { type: "heartbeat.run.status", payload: { status: "failed" } });
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(0);
  });

  it("rate-limits duplicate events within the dedup window", async () => {
    const { store, transport, sent, subscribe, emit } = await makeNotifierFixture();
    store.upsert("1", "u", { companyId: "co-1" });
    let t = 1000;
    const n = new Notifier({
      transport,
      store,
      subscribeCompanyLiveEvents: subscribe,
      dedupWindowMs: 10_000,
      now: () => t,
    });
    n.start();
    emit("co-1", { type: "heartbeat.run.status", payload: { status: "failed" } });
    emit("co-1", { type: "heartbeat.run.status", payload: { status: "failed" } });
    t = 5000; // still inside window
    emit("co-1", { type: "heartbeat.run.status", payload: { status: "failed" } });
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(1);
    t = 20_000; // outside window
    emit("co-1", { type: "heartbeat.run.status", payload: { status: "failed" } });
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(2);
  });

  it("unsubscribeSession removes listener", async () => {
    const { store, transport, sent, subscribe, emit, subscribers } = await makeNotifierFixture();
    store.upsert("1", "u", { companyId: "co-1" });
    const n = new Notifier({ transport, store, subscribeCompanyLiveEvents: subscribe });
    n.start();
    expect(subscribers.get("co-1")?.length).toBe(1);
    n.unsubscribeSession("1");
    emit("co-1", { type: "heartbeat.run.status", payload: { status: "failed" } });
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(0);
  });

  it("re-subscribing same chat to a new company removes the old listener", async () => {
    const { store, transport, subscribe, subscribers } = await makeNotifierFixture();
    const n = new Notifier({ transport, store, subscribeCompanyLiveEvents: subscribe });
    const s1 = store.upsert("1", "u", { companyId: "co-a" });
    n.subscribeSession(s1);
    const s2 = store.upsert("1", "u", { companyId: "co-b" });
    n.subscribeSession(s2);
    expect(subscribers.get("co-a")?.length ?? 0).toBe(0);
    expect(subscribers.get("co-b")?.length).toBe(1);
  });

  it("stop() clears all subscriptions", async () => {
    const { store, transport, subscribe, subscribers } = await makeNotifierFixture();
    store.upsert("1", "u", { companyId: "co-1" });
    store.upsert("2", "u", { companyId: "co-2" });
    const n = new Notifier({ transport, store, subscribeCompanyLiveEvents: subscribe });
    n.start();
    n.stop();
    expect(subscribers.get("co-1")?.length ?? 0).toBe(0);
    expect(subscribers.get("co-2")?.length ?? 0).toBe(0);
  });

  // S43-2 — agent reply forwarding with ownership gating

  it("forwards agent comment only when the issue is owned by this chat", async () => {
    const { store, transport, sent, subscribe, emit } = await makeNotifierFixture();
    // digestEnabled=false to test the raw per-event delivery path
    store.upsert("1", "u", { companyId: "co-1", digestEnabled: false });
    store.trackOwnedIssue("1", "iss-owned");
    const n = new Notifier({ transport, store, subscribeCompanyLiveEvents: subscribe });
    n.start();
    // agent comment on a DIFFERENT issue → ignored
    emit("co-1", {
      type: "activity.logged",
      payload: {
        action: "issue.comment_added",
        actorType: "agent",
        entityType: "issue",
        entityId: "iss-other",
        details: { identifier: "ACM-99", bodySnippet: "ignore me" },
      },
    });
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(0);
    // agent comment on the owned issue → delivered
    emit("co-1", {
      type: "activity.logged",
      payload: {
        action: "issue.comment_added",
        actorType: "agent",
        entityType: "issue",
        entityId: "iss-owned",
        details: { identifier: "WEB-42", bodySnippet: "all done" },
      },
    });
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("WEB-42");
  });

  it("forwards agent completion on owned issue (digest off)", async () => {
    const { store, transport, sent, subscribe, emit } = await makeNotifierFixture();
    store.upsert("1", "u", { companyId: "co-1", digestEnabled: false });
    store.trackOwnedIssue("1", "iss-owned");
    const n = new Notifier({ transport, store, subscribeCompanyLiveEvents: subscribe });
    n.start();
    emit("co-1", {
      type: "activity.logged",
      payload: {
        action: "issue.updated",
        actorType: "agent",
        entityType: "issue",
        entityId: "iss-owned",
        details: { identifier: "WEB-42", status: "done", issueTitle: "X" },
      },
    });
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("completata");
  });

  it("does not forward founder's own comments (actorType=user)", async () => {
    const { store, transport, sent, subscribe, emit } = await makeNotifierFixture();
    store.upsert("1", "u", { companyId: "co-1", digestEnabled: false });
    store.trackOwnedIssue("1", "iss-owned");
    const n = new Notifier({ transport, store, subscribeCompanyLiveEvents: subscribe });
    n.start();
    emit("co-1", {
      type: "activity.logged",
      payload: {
        action: "issue.comment_added",
        actorType: "user",
        entityType: "issue",
        entityId: "iss-owned",
        details: { identifier: "WEB-42", bodySnippet: "founder note" },
      },
    });
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(0);
  });

  // S43-3 — digest mode integration

  it("digest mode batches multiple agent comments + terminal into one message", async () => {
    const { store, transport, sent, subscribe, emit } = await makeNotifierFixture();
    store.upsert("1", "u", { companyId: "co-1", digestEnabled: true });
    store.trackOwnedIssue("1", "iss-owned");
    const n = new Notifier({ transport, store, subscribeCompanyLiveEvents: subscribe });
    n.start();
    // 2 comments + 1 completion → 1 digest message
    for (const snippet of ["step one", "step two"]) {
      emit("co-1", {
        type: "activity.logged",
        payload: {
          action: "issue.comment_added",
          actorType: "agent",
          entityType: "issue",
          entityId: "iss-owned",
          details: { identifier: "WEB-42", issueTitle: "Batched", bodySnippet: snippet },
        },
      });
    }
    emit("co-1", {
      type: "activity.logged",
      payload: {
        action: "issue.updated",
        actorType: "agent",
        entityType: "issue",
        entityId: "iss-owned",
        details: { identifier: "WEB-42", issueTitle: "Batched", status: "done" },
      },
    });
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("step one");
    expect(sent[0].text).toContain("step two");
    expect(sent[0].text).toContain("completata");
  });

  it("skipIfActorIs drops approval events the founder themself resolved", async () => {
    const { store, transport, sent, subscribe, emit } = await makeNotifierFixture();
    store.upsert("1", "user-founder", { companyId: "co-1" });
    const n = new Notifier({ transport, store, subscribeCompanyLiveEvents: subscribe });
    n.start();
    emit("co-1", {
      type: "activity.logged",
      payload: {
        action: "approval.approved",
        actorType: "user",
        actorId: "user-founder",
        entityId: "app-1",
        details: { type: "hire_agent" },
      },
    });
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(0);
  });

  it("skipIfActorIs allows approval events resolved by someone else", async () => {
    const { store, transport, sent, subscribe, emit } = await makeNotifierFixture();
    store.upsert("1", "user-founder", { companyId: "co-1" });
    const n = new Notifier({ transport, store, subscribeCompanyLiveEvents: subscribe });
    n.start();
    emit("co-1", {
      type: "activity.logged",
      payload: {
        action: "approval.approved",
        actorType: "user",
        actorId: "user-cofounder",
        entityId: "app-1",
        details: { type: "hire_agent" },
      },
    });
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("approvata");
  });
});
