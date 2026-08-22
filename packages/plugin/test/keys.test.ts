import { describe, expect, test } from "bun:test";
import { matchesKey, primaryModifier } from "../src/keys.ts";

const press = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", { key, ...init });

describe("primaryModifier", () => {
  test("is Cmd on Apple hardware", () => {
    expect(primaryModifier("MacIntel")).toBe("super");
    expect(primaryModifier("iPhone")).toBe("super");
    expect(primaryModifier("iPad")).toBe("super");
  });

  test("is Ctrl everywhere else", () => {
    expect(primaryModifier("Win32")).toBe("ctrl");
    expect(primaryModifier("Linux x86_64")).toBe("ctrl");
    expect(primaryModifier("")).toBe("ctrl");
  });
});

describe("mod", () => {
  // `matchesKey` resolves `mod` against the real platform once, at module load,
  // so these assertions are written in terms of whatever that resolution was
  // rather than pretending the test runner is a Mac.
  const primary = primaryModifier(navigator.platform);
  const withPrimary = primary === "super" ? { metaKey: true } : { ctrlKey: true };
  const withOther = primary === "super" ? { ctrlKey: true } : { metaKey: true };

  test("matches the platform's primary modifier", () => {
    expect(matchesKey(press(",", withPrimary), "mod+,")).toBe(true);
  });

  test("does not match the other platform's modifier", () => {
    expect(matchesKey(press(",", withOther), "mod+,")).toBe(false);
  });

  test("stays exact when composed with further modifiers", () => {
    expect(matchesKey(press("p", { ...withPrimary, shiftKey: true }), "mod+shift+p")).toBe(true);
    expect(matchesKey(press("p", withPrimary), "mod+shift+p")).toBe(false);
  });
});

describe("matchesKey", () => {
  test("modifiers must match exactly", () => {
    expect(matchesKey(press("p", { ctrlKey: true }), "ctrl+p")).toBe(true);
    expect(matchesKey(press("p", { ctrlKey: true, shiftKey: true }), "ctrl+p")).toBe(false);
    expect(matchesKey(press("p"), "ctrl+p")).toBe(false);
  });

  test("pi's super is the Meta key", () => {
    expect(matchesKey(press(",", { metaKey: true }), "super+,")).toBe(true);
    expect(matchesKey(press(",", { ctrlKey: true }), "super+,")).toBe(false);
  });
});
