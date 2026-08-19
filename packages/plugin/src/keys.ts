import type { KeyId } from "./types.ts";

/** Browser key names that differ from pi's. pi's `super` is Cmd/Meta. */
const ALIASES: Readonly<Record<string, string>> = {
  " ": "space",
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
  esc: "escape",
  return: "enter",
};

const normalize = (key: string): string => {
  const lower = key.toLowerCase();
  return ALIASES[lower] ?? lower;
};

/**
 * Match a keyboard event against pi's `KeyId` format (`"ctrl+shift+p"`).
 *
 * Modifiers must match exactly, so `ctrl+p` does not fire on `ctrl+shift+p`.
 * `escape`/`esc` and `enter`/`return` are interchangeable, as in pi.
 */
export const matchesKey = (event: KeyboardEvent, keyId: KeyId): boolean => {
  const parts = keyId.toLowerCase().split("+");
  const key = parts.at(-1);
  if (key === undefined) return false;

  const modifiers = new Set(parts.slice(0, -1));
  if (modifiers.has("ctrl") !== event.ctrlKey) return false;
  if (modifiers.has("shift") !== event.shiftKey) return false;
  if (modifiers.has("alt") !== event.altKey) return false;
  if (modifiers.has("super") !== event.metaKey) return false;

  return normalize(key) === normalize(event.key);
};
