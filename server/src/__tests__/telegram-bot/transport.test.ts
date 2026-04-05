// S43 — Telegram CEO Bot — transport tests (mocked fetch)
import { describe, expect, it, vi } from "vitest";
import { TelegramApiError, TelegramTransport } from "../../services/telegram-bot/transport.js";

function makeFetchMock(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  let call = 0;
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const resp = responses[call++] ?? responses[responses.length - 1];
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return {
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 400),
      json: async () => resp.body,
    } as unknown as Response;
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

describe("TelegramTransport", () => {
  it("refuses construction without token", () => {
    expect(() => new TelegramTransport({ token: "" })).toThrow(/token/);
  });

  it("builds the correct endpoint URL", async () => {
    const { fetchImpl, calls } = makeFetchMock([{ ok: true, body: { ok: true, result: [] } }]);
    const t = new TelegramTransport({ token: "secret", fetchImpl });
    await t.getUpdates(0, 0);
    expect(calls[0].url).toBe("https://api.telegram.org/botsecret/getUpdates");
  });

  it("sendMessage posts chat_id + text + disables preview by default", async () => {
    const { fetchImpl, calls } = makeFetchMock([{ ok: true, body: { ok: true, result: {} } }]);
    const t = new TelegramTransport({ token: "s", fetchImpl });
    await t.sendMessage(42, "hi");
    expect(calls[0].body).toMatchObject({
      chat_id: 42,
      text: "hi",
      disable_web_page_preview: true,
    });
  });

  it("sendMessage includes parse_mode and reply_markup when provided", async () => {
    const { fetchImpl, calls } = makeFetchMock([{ ok: true, body: { ok: true, result: {} } }]);
    const t = new TelegramTransport({ token: "s", fetchImpl });
    await t.sendMessage("abc", "**bold**", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "Yes", callback_data: "y" }]] },
    });
    expect(calls[0].body).toMatchObject({
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "Yes", callback_data: "y" }]] },
    });
  });

  it("throws TelegramApiError with description on non-ok response", async () => {
    const { fetchImpl } = makeFetchMock([
      { ok: false, status: 400, body: { ok: false, description: "Bad Request: invalid chat_id" } },
    ]);
    const t = new TelegramTransport({ token: "s", fetchImpl });
    await expect(t.sendMessage(1, "x")).rejects.toBeInstanceOf(TelegramApiError);
  });

  it("throws TelegramApiError on invalid JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("not json");
        },
      }) as unknown as Response,
    ) as unknown as typeof fetch;
    const t = new TelegramTransport({ token: "s", fetchImpl });
    await expect(t.getMe()).rejects.toBeInstanceOf(TelegramApiError);
  });

  it("getUpdates returns the result array", async () => {
    const { fetchImpl } = makeFetchMock([
      { ok: true, body: { ok: true, result: [{ update_id: 1 }, { update_id: 2 }] } },
    ]);
    const t = new TelegramTransport({ token: "s", fetchImpl });
    const updates = await t.getUpdates(0, 5);
    expect(updates).toHaveLength(2);
    expect(updates[0].update_id).toBe(1);
  });

  it("setMyCommands passes commands list through", async () => {
    const { fetchImpl, calls } = makeFetchMock([{ ok: true, body: { ok: true, result: true } }]);
    const t = new TelegramTransport({ token: "s", fetchImpl });
    await t.setMyCommands([{ command: "start", description: "Start" }]);
    expect(calls[0].body).toEqual({ commands: [{ command: "start", description: "Start" }] });
  });
});
