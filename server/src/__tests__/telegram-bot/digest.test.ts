// S43-3 — Telegram CEO Bot — DigestComposer tests
import { describe, expect, it, vi } from "vitest";
import { DigestComposer } from "../../services/telegram-bot/digest.js";
import type { TelegramTransport } from "../../services/telegram-bot/transport.js";

function makeFixture(opts?: { windowMs?: number }) {
  const sent: Array<{ chatId: string; text: string }> = [];
  const transport = {
    sendMessage: vi.fn(async (chatId: string | number, text: string) => {
      sent.push({ chatId: String(chatId), text });
    }),
  } as unknown as TelegramTransport;
  let now = 1_000_000;
  const composer = new DigestComposer({
    transport,
    windowMs: opts?.windowMs ?? 90_000,
    now: () => now,
  });
  return { composer, sent, advance: (ms: number) => (now += ms) };
}

describe("DigestComposer", () => {
  it("batches multiple comments into one message when terminal arrives", async () => {
    const { composer, sent } = makeFixture();
    composer.addComment({
      chatId: "1",
      issueId: "iss-1",
      identifier: "WEB-10",
      title: "Task X",
      snippet: "Step 1 done",
    });
    composer.addComment({
      chatId: "1",
      issueId: "iss-1",
      identifier: "WEB-10",
      title: "Task X",
      snippet: "Step 2 done",
    });
    composer.addTerminalStatus({
      chatId: "1",
      issueId: "iss-1",
      identifier: "WEB-10",
      title: "Task X",
      status: "done",
    });
    // Give the floating promise a tick.
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(1);
    const text = sent[0].text;
    expect(text).toContain("WEB-10");
    expect(text).toContain("completata");
    expect(text).toContain("Step 1 done");
    expect(text).toContain("Step 2 done");
    expect(text).toContain("Stato: done");
  });

  it("single comment without terminal gets a ‹aggiornamento› header (timer flush)", async () => {
    const { composer, sent } = makeFixture();
    // Replace setTimeout with a sync trigger by flushing the only bucket manually.
    composer.addComment({
      chatId: "1",
      issueId: "iss-2",
      identifier: "WEB-11",
      title: "Task Y",
      snippet: "Partial update",
    });
    // Simulate window expiry via flushAll (tests don't use real timers)
    composer.flushAll();
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("aggiornamento");
    expect(sent[0].text).toContain("Partial update");
    expect(sent[0].text).not.toContain("Stato: done");
  });

  it("separates buckets by (chatId, issueId)", async () => {
    const { composer, sent } = makeFixture();
    composer.addComment({
      chatId: "1",
      issueId: "iss-a",
      identifier: "WEB-1",
      title: "A",
      snippet: "a1",
    });
    composer.addComment({
      chatId: "1",
      issueId: "iss-b",
      identifier: "WEB-2",
      title: "B",
      snippet: "b1",
    });
    composer.addComment({
      chatId: "2",
      issueId: "iss-a",
      identifier: "WEB-1",
      title: "A",
      snippet: "other founder",
    });
    composer.flushAll();
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(3);
    // Verify no cross-contamination: WEB-1 bucket for chat 1 contains a1 but
    // not b1 or "other founder"
    const chat1WebA = sent.find((s) => s.chatId === "1" && s.text.includes("WEB-1"));
    expect(chat1WebA?.text).toContain("a1");
    expect(chat1WebA?.text).not.toContain("b1");
    expect(chat1WebA?.text).not.toContain("other founder");
  });

  it("clamps long comment snippets to MAX_COMMENT_LEN", async () => {
    const { composer, sent } = makeFixture();
    const long = "x".repeat(500);
    composer.addComment({
      chatId: "1",
      issueId: "iss-1",
      identifier: "WEB-1",
      title: "",
      snippet: long,
    });
    composer.flushAll();
    await new Promise((r) => setImmediate(r));
    expect(sent[0].text).toContain("…");
    // Total message length bounded — no single comment > 200 chars
    const xCount = (sent[0].text.match(/x/g) ?? []).length;
    expect(xCount).toBeLessThan(250);
  });

  it("terminal-only event (no prior comments) still produces a one-line completion", async () => {
    const { composer, sent } = makeFixture();
    composer.addTerminalStatus({
      chatId: "1",
      issueId: "iss-1",
      identifier: "WEB-5",
      title: "Quick task",
      status: "done",
    });
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("completata");
    expect(sent[0].text).toContain("WEB-5");
  });

  it("cancelled status renders the cancel state (not done)", async () => {
    const { composer, sent } = makeFixture();
    composer.addComment({
      chatId: "1",
      issueId: "iss-1",
      identifier: "WEB-9",
      title: "",
      snippet: "Reason",
    });
    composer.addTerminalStatus({
      chatId: "1",
      issueId: "iss-1",
      identifier: "WEB-9",
      title: "",
      status: "cancelled",
    });
    await new Promise((r) => setImmediate(r));
    expect(sent[0].text).toContain("Stato: cancelled");
  });

  it("flushing an empty bucket is a no-op", async () => {
    const { composer, sent } = makeFixture();
    composer.flushAll();
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(0);
  });

  it("overflowing MAX_ENTRIES_PER_DIGEST rolls into a second bucket", async () => {
    const { composer, sent } = makeFixture();
    // MAX_ENTRIES_PER_DIGEST is 8 in digest.ts
    for (let i = 0; i < 10; i++) {
      composer.addComment({
        chatId: "1",
        issueId: "iss-1",
        identifier: "WEB-1",
        title: "X",
        snippet: `c${i}`,
      });
    }
    composer.flushAll();
    await new Promise((r) => setImmediate(r));
    // First 8 comments triggered auto-flush; the overflow opened a second
    // bucket which contains the remaining 2; flushAll sent the second one.
    expect(sent.length).toBe(2);
    expect(sent[0].text).toContain("c0");
    expect(sent[0].text).toContain("c7");
    expect(sent[1].text).toContain("c8");
    expect(sent[1].text).toContain("c9");
  });
});
