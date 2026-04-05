// S43 — Telegram CEO Bot — auth module tests
import { describe, expect, it } from "vitest";
import { authenticate, parseAllowedChatIds } from "../../services/telegram-bot/auth.js";

describe("parseAllowedChatIds", () => {
  it("returns empty entries on undefined/empty/null", () => {
    expect(parseAllowedChatIds(undefined).entries).toEqual([]);
    expect(parseAllowedChatIds(null).entries).toEqual([]);
    expect(parseAllowedChatIds("").entries).toEqual([]);
    expect(parseAllowedChatIds("   ").entries).toEqual([]);
  });

  it("parses a single entry", () => {
    const { entries, warnings } = parseAllowedChatIds("12345:uuid-1");
    expect(entries).toEqual([{ chatId: "12345", userId: "uuid-1" }]);
    expect(warnings).toEqual([]);
  });

  it("parses multiple comma-separated entries", () => {
    const { entries } = parseAllowedChatIds("12345:a,67890:b");
    expect(entries).toEqual([
      { chatId: "12345", userId: "a" },
      { chatId: "67890", userId: "b" },
    ]);
  });

  it("trims whitespace around entries and parts", () => {
    const { entries } = parseAllowedChatIds("  12345 : a  ,  67890:b  ");
    expect(entries).toEqual([
      { chatId: "12345", userId: "a" },
      { chatId: "67890", userId: "b" },
    ]);
  });

  it("warns and skips malformed entries", () => {
    const { entries, warnings } = parseAllowedChatIds("12345:ok,broken,67890:good");
    expect(entries).toEqual([
      { chatId: "12345", userId: "ok" },
      { chatId: "67890", userId: "good" },
    ]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("broken");
  });

  it("warns on non-numeric chat_id", () => {
    const { entries, warnings } = parseAllowedChatIds("abc:x,123:y");
    expect(entries).toEqual([{ chatId: "123", userId: "y" }]);
    expect(warnings[0]).toContain("invalid chat_id");
  });

  it("accepts negative chat_ids (Telegram groups are negative)", () => {
    const { entries } = parseAllowedChatIds("-100123:u");
    expect(entries).toEqual([{ chatId: "-100123", userId: "u" }]);
  });

  it("warns on empty userId", () => {
    // Colon-at-end triggers the "malformed" warning (colonIdx === len-1).
    // Our auth implementation collapses that with 'missing userId' into the
    // same malformed-entry error, which is fine: the entry is dropped either
    // way and the warning makes the reason visible in the startup log.
    const { entries, warnings } = parseAllowedChatIds("123:,456:ok");
    expect(entries).toEqual([{ chatId: "456", userId: "ok" }]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("123:");
  });

  it("deduplicates repeated chat_ids (first wins)", () => {
    const { entries, warnings } = parseAllowedChatIds("123:first,123:second");
    expect(entries).toEqual([{ chatId: "123", userId: "first" }]);
    expect(warnings[0]).toContain("duplicate");
  });
});

describe("authenticate", () => {
  const list = [
    { chatId: "12345", userId: "uuid-a" },
    { chatId: "67890", userId: "uuid-b" },
  ];

  it("returns ok with userId when chat_id matches (number input)", () => {
    expect(authenticate(12345, list)).toEqual({ ok: true, userId: "uuid-a" });
  });

  it("returns ok when chat_id matches (string input)", () => {
    expect(authenticate("67890", list)).toEqual({ ok: true, userId: "uuid-b" });
  });

  it("returns not ok on miss", () => {
    expect(authenticate(99999, list)).toEqual({ ok: false });
  });

  it("returns not ok on empty allowlist", () => {
    expect(authenticate(12345, [])).toEqual({ ok: false });
  });
});
