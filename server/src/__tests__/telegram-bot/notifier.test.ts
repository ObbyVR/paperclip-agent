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
    expect(m?.render({ type: "heartbeat.run.status" })).toContain("Alice");
  });

  it("ignores heartbeat.run.status with non-failed status", () => {
    expect(
      classifyEvent({ type: "heartbeat.run.status", payload: { status: "succeeded" } }),
    ).toBeNull();
  });

  it("classifies activity.logged kind=approval.created", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: { kind: "approval.created" },
    });
    expect(m?.key).toBe("approvalsPending");
  });

  it("classifies activity.logged kind=issue.errored", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: { kind: "issue.errored", identifier: "ACM-7" },
    });
    expect(m?.key).toBe("issueErrored");
    expect(m?.render({ type: "activity.logged" })).toContain("ACM-7");
  });

  it("classifies activity.logged kind=agent.hired", () => {
    const m = classifyEvent({
      type: "activity.logged",
      payload: { kind: "agent.hired", name: "Bob" },
    });
    expect(m?.key).toBe("agentHired");
    expect(m?.render({ type: "activity.logged" })).toContain("Bob");
  });

  it("returns null for unrelated events", () => {
    expect(classifyEvent({ type: "plugin.ui.updated" })).toBeNull();
    expect(classifyEvent({ type: "activity.logged", payload: { kind: "something.else" } })).toBeNull();
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
});
