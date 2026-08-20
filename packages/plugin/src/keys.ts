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

/** pi's modifier set exactly — note there is no `mod`; `super` is Cmd on macOS. */
type Modifier = "ctrl" | "shift" | "alt" | "super";

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
