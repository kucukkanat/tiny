import { beforeEach, describe, expect, test } from "bun:test";
import {
  deleteConversation,
  getConversation,
  listConversations,
  newConversationId,
  putConversation,
  titleFrom,
} from "../src/conversations.ts";
import { loadSettings, saveSettings, settingsComplete } from "../src/settings.ts";

describe("titleFrom", () => {
  test("uses the first line", () => {
    expect(titleFrom("hello world\nsecond line")).toBe("hello world");
  });
  test("truncates long titles with an ellipsis", () => {
    expect(titleFrom("x".repeat(60))).toBe(`${"x".repeat(48)}…`);
  });
  test("falls back for empty input", () => {
    expect(titleFrom("   ")).toBe("New chat");
  });
});

describe("conversations store", () => {
  const conversation = (id: string, updatedAt: number) => ({
    id,
    title: `chat ${id}`,
    updatedAt,
    messages: [{ role: "user" as const, content: "hi" }],
  });

  test("round-trips a conversation", async () => {
    const c = conversation(newConversationId(), 1);
    await putConversation(c);
    expect(await getConversation(c.id)).toEqual(c);
  });

  test("lists newest first", async () => {
    const old = conversation(newConversationId(), 100);
    const fresh = conversation(newConversationId(), 200);
    await putConversation(old);
    await putConversation(fresh);
    const ids = (await listConversations()).map((c) => c.id);
    expect(ids.indexOf(fresh.id)).toBeLessThan(ids.indexOf(old.id));
  });

  test("deletes", async () => {
    const c = conversation(newConversationId(), 1);
    await putConversation(c);
    await deleteConversation(c.id);
    expect(await getConversation(c.id)).toBeUndefined();
  });
});

describe("settings", () => {
  beforeEach(() => localStorage.clear());

  test("returns undefined when nothing is stored", () => {
    expect(loadSettings()).toBeUndefined();
  });

  test("round-trips settings", () => {
    const settings = { baseUrl: "https://api.example.com/v1", apiKey: "sk-1", model: "m" };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  test("rejects malformed stored JSON", () => {
    localStorage.setItem("tiny-chat:settings", "{not json");
    expect(loadSettings()).toBeUndefined();
    localStorage.setItem("tiny-chat:settings", JSON.stringify({ baseUrl: 1 }));
    expect(loadSettings()).toBeUndefined();
  });

  test("settingsComplete requires every field to be non-empty", () => {
    expect(settingsComplete(undefined)).toBe(false);
    expect(settingsComplete({ baseUrl: "x", apiKey: "", model: "m" })).toBe(false);
    expect(settingsComplete({ baseUrl: "x", apiKey: "k", model: "m" })).toBe(true);
  });
});
