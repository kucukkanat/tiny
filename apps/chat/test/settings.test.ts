import { beforeEach, describe, expect, test } from "bun:test";
import { loadSettings, saveSettings, settingsComplete } from "../src/settings.ts";

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
