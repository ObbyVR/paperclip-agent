// S43 — Telegram CEO Bot — command handler pure-function tests
import { describe, expect, it } from "vitest";
import { parseIdAndNote } from "../../services/telegram-bot/commands/approvals.js";
import { splitTitleAndDescription, MAX_TITLE_LEN } from "../../services/telegram-bot/commands/task.js";

describe("splitTitleAndDescription", () => {
  it("single short line → title only", () => {
    expect(splitTitleAndDescription("Hello")).toEqual({ title: "Hello", description: null });
  });

  it("empty/whitespace → empty title, null description", () => {
    expect(splitTitleAndDescription("")).toEqual({ title: "", description: null });
    expect(splitTitleAndDescription("   \n  ")).toEqual({ title: "", description: null });
  });

  it("multi-line → first line = title, rest = description", () => {
    expect(splitTitleAndDescription("Titolo\nDesc line 1\nDesc line 2")).toEqual({
      title: "Titolo",
      description: "Desc line 1\nDesc line 2",
    });
  });

  it("multi-line with empty trailing → title only", () => {
    expect(splitTitleAndDescription("Titolo\n")).toEqual({ title: "Titolo", description: null });
  });

  it("truncates title > MAX_TITLE_LEN on single long line", () => {
    const long = "a".repeat(MAX_TITLE_LEN + 10);
    const r = splitTitleAndDescription(long);
    expect(r.title.length).toBe(MAX_TITLE_LEN);
    expect(r.title.endsWith("…")).toBe(true);
    expect(r.description).toBe(long);
  });

  it("truncates first line > MAX_TITLE_LEN when multi-line", () => {
    const longFirst = "b".repeat(MAX_TITLE_LEN + 5);
    const r = splitTitleAndDescription(`${longFirst}\nmore stuff`);
    expect(r.title.length).toBe(MAX_TITLE_LEN);
    expect(r.title.endsWith("…")).toBe(true);
    // keeps the full original text so nothing is lost
    expect(r.description).toContain(longFirst);
    expect(r.description).toContain("more stuff");
  });

  it("trims surrounding whitespace", () => {
    expect(splitTitleAndDescription("   hi   ")).toEqual({ title: "hi", description: null });
  });
});

describe("parseIdAndNote", () => {
  it("returns empty id on empty input", () => {
    expect(parseIdAndNote("")).toEqual({ id: "", note: null });
    expect(parseIdAndNote("   ")).toEqual({ id: "", note: null });
  });

  it("id only", () => {
    expect(parseIdAndNote("abc-123")).toEqual({ id: "abc-123", note: null });
  });

  it("id + single-word note", () => {
    expect(parseIdAndNote("abc-123 ok")).toEqual({ id: "abc-123", note: "ok" });
  });

  it("id + multi-word note preserves spaces", () => {
    expect(parseIdAndNote("abc-123 looks great to me")).toEqual({
      id: "abc-123",
      note: "looks great to me",
    });
  });

  it("handles tab as separator", () => {
    expect(parseIdAndNote("abc-123\tsome note")).toEqual({ id: "abc-123", note: "some note" });
  });

  it("trims trailing whitespace from note", () => {
    expect(parseIdAndNote("abc  reason with spaces   ")).toEqual({
      id: "abc",
      note: "reason with spaces",
    });
  });
});
