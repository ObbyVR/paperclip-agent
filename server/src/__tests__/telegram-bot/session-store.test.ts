// S43 — Telegram CEO Bot — session store tests
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionStore } from "../../services/telegram-bot/session-store.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tgb-session-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeStore(debounceMs = 0) {
  return new SessionStore({ filePath: path.join(tmpDir, "sessions.json"), debounceMs });
}

describe("SessionStore.load", () => {
  it("handles missing file gracefully", async () => {
    const s = makeStore();
    await s.load();
    expect(s.list()).toEqual([]);
  });

  it("loads a previously saved file", async () => {
    const file = path.join(tmpDir, "sessions.json");
    const payload = JSON.stringify([
      {
        chatId: "123",
        userId: "u1",
        companyId: "c1",
        ceoAgentId: "a1",
        notifyOn: {
          approvalsPending: false,
          runFailed: true,
          issueErrored: true,
          agentHired: true,
        },
        updatedAt: "2026-04-05T00:00:00.000Z",
      },
    ]);
    await fs.writeFile(file, payload);
    const s = new SessionStore({ filePath: file });
    await s.load();
    expect(s.list()).toHaveLength(1);
    expect(s.get("123")?.companyId).toBe("c1");
    expect(s.get("123")?.notifyOn.approvalsPending).toBe(false);
  });

  it("recovers from corrupted JSON by starting empty", async () => {
    const file = path.join(tmpDir, "sessions.json");
    await fs.writeFile(file, "{{not json");
    const s = new SessionStore({ filePath: file });
    await s.load();
    expect(s.list()).toEqual([]);
  });

  it("filters out entries with missing required fields", async () => {
    const file = path.join(tmpDir, "sessions.json");
    await fs.writeFile(
      file,
      JSON.stringify([
        { chatId: "1", userId: "u" },
        { chatId: "", userId: "u" }, // invalid
        { chatId: "2" }, // invalid
        null,
      ]),
    );
    const s = new SessionStore({ filePath: file });
    await s.load();
    expect(s.list().map((x) => x.chatId).sort()).toEqual(["1"]);
  });

  it("fills defaults for missing notifyOn keys", async () => {
    const file = path.join(tmpDir, "sessions.json");
    await fs.writeFile(
      file,
      JSON.stringify([{ chatId: "1", userId: "u", notifyOn: { runFailed: false } }]),
    );
    const s = new SessionStore({ filePath: file });
    await s.load();
    const sess = s.get("1")!;
    expect(sess.notifyOn.runFailed).toBe(false);
    expect(sess.notifyOn.approvalsPending).toBe(true); // default
  });
});

describe("SessionStore.upsert + flush", () => {
  it("creates a new session with defaults", async () => {
    const s = makeStore();
    await s.load();
    const next = s.upsert("42", "user-x", { companyId: "c1" });
    expect(next.chatId).toBe("42");
    expect(next.userId).toBe("user-x");
    expect(next.companyId).toBe("c1");
    expect(next.ceoAgentId).toBeNull();
    expect(next.notifyOn.approvalsPending).toBe(true);
  });

  it("merges patch over existing session", async () => {
    const s = makeStore();
    await s.load();
    s.upsert("42", "u", { companyId: "c1" });
    const after = s.upsert("42", "u", { ceoAgentId: "a1" });
    expect(after.companyId).toBe("c1");
    expect(after.ceoAgentId).toBe("a1");
  });

  it("round-trips through disk", async () => {
    const file = path.join(tmpDir, "sessions.json");
    const s1 = new SessionStore({ filePath: file, debounceMs: 0 });
    await s1.load();
    s1.upsert("10", "user-1", { companyId: "co1", ceoAgentId: "ag1" });
    await s1.flush();

    const s2 = new SessionStore({ filePath: file });
    await s2.load();
    expect(s2.get("10")?.companyId).toBe("co1");
    expect(s2.get("10")?.ceoAgentId).toBe("ag1");
  });

  it("updates notifyOn with partial patch", async () => {
    const s = makeStore();
    await s.load();
    s.upsert("1", "u", {});
    const after = s.upsert("1", "u", {
      notifyOn: {
        approvalsPending: false,
        runFailed: true,
        issueErrored: true,
        agentHired: true,
      },
    });
    expect(after.notifyOn.approvalsPending).toBe(false);
    expect(after.notifyOn.runFailed).toBe(true);
  });

  it("re-pins userId on upsert (allowlist rotation)", async () => {
    const s = makeStore();
    await s.load();
    s.upsert("1", "old-user", { companyId: "c" });
    const after = s.upsert("1", "new-user", {});
    expect(after.userId).toBe("new-user");
  });

  it("writes atomically (tmp file + rename, no lingering .tmp)", async () => {
    const s = makeStore();
    await s.load();
    s.upsert("1", "u", { companyId: "c" });
    await s.flush();
    const files = await fs.readdir(tmpDir);
    expect(files).toContain("sessions.json");
    expect(files.filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});
