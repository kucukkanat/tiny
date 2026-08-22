/* ------------------------------------------------------------------ *
 * Keys — pi's `KeyId` shape (@earendil-works/pi-tui `keys.d.ts`).
 * ------------------------------------------------------------------ */

type Letter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type SymbolKey =
  | "`"
  | "-"
  | "="
  | "["
  | "]"
  | "\\"
  | ";"
  | "'"
  | ","
  | "."
  | "/"
  | "!"
  | "@"
  | "#"
  | "$"
  | "%"
  | "^"
  | "&"
  | "*"
  | "("
  | ")"
  | "_"
  | "+"
  | "|"
  | "~"
  | "{"
  | "}"
  | ":"
  | "<"
  | ">"
  | "?";
type SpecialKey =
  | "escape"
  | "esc"
  | "enter"
  | "return"
  | "tab"
  | "space"
  | "backspace"
  | "delete"
  | "insert"
  | "home"
  | "end"
  | "pageUp"
  | "pageDown"
  | "up"
  | "down"
  | "left"
  | "right";
type BaseKey = Letter | Digit | SymbolKey | SpecialKey;

/** pi's modifier set — `super` is Cmd on macOS. */
type PiModifier = "ctrl" | "shift" | "alt" | "super";

/**
 * pi's modifiers plus `mod` — ours, because a browser app is cross-platform in
 * a way a terminal harness is not. `mod` matches Cmd on Apple hardware and Ctrl
 * everywhere else, so one registration covers what used to take two:
 * `mod+,` instead of `super+,` *and* `ctrl+,`.
 */
type Modifier = PiModifier | "mod";

/**
 * pi expands modifiers recursively; two levels covers every practical binding
 * without the compiler cost of the full expansion.
 */
export type KeyId = BaseKey | `${Modifier}+${BaseKey}` | `${Modifier}+${Modifier}+${BaseKey}`;

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
 * What `mod` means on `platform` — `super` (Cmd) on Apple hardware, `ctrl`
 * everywhere else. A pure function of the string, so the mapping is testable
 * without pretending to be a Mac.
 */
export const primaryModifier = (platform: string): "super" | "ctrl" =>
  /mac|iphone|ipad|ipod/i.test(platform) ? "super" : "ctrl";

/** Resolved once: the platform does not change under a running page. */
const MOD = primaryModifier(typeof navigator === "undefined" ? "" : navigator.platform);

/**
 * Match a keyboard event against pi's `KeyId` format (`"ctrl+shift+p"`).
 *
 * Modifiers must match exactly, so `ctrl+p` does not fire on `ctrl+shift+p`.
 * `escape`/`esc` and `enter`/`return` are interchangeable, as in pi. `mod` is
 * resolved to this platform's primary modifier before matching.
 */
export const matchesKey = (event: KeyboardEvent, keyId: KeyId): boolean => {
  const parts = keyId.toLowerCase().split("+");
  const key = parts.at(-1);
  if (key === undefined) return false;

  const modifiers = new Set(parts.slice(0, -1));
  if (modifiers.delete("mod")) modifiers.add(MOD);
  if (modifiers.has("ctrl") !== event.ctrlKey) return false;
  if (modifiers.has("shift") !== event.shiftKey) return false;
  if (modifiers.has("alt") !== event.altKey) return false;
  if (modifiers.has("super") !== event.metaKey) return false;

  return normalize(key) === normalize(event.key);
};
