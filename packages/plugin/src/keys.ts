/* ------------------------------------------------------------------ *
 * Keys — pi's `KeyId` shape (@earendil-works/pi-tui `keys.d.ts`).
 * ------------------------------------------------------------------ */

/** Each character of `S` as a union member — how the key sets below stay one string each. */
type CharOf<S extends string> = S extends `${infer C}${infer Rest}` ? C | CharOf<Rest> : never;

type Letter = CharOf<"abcdefghijklmnopqrstuvwxyz">;
type Digit = CharOf<"0123456789">;
type SymbolKey = CharOf<"`-=[]\\;',./!@#$%^&*()_+|~{}:<>?">;
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

/** pi's modifiers plus `mod` (ours): Cmd on Apple hardware, Ctrl everywhere else. */
type Modifier = PiModifier | "mod";

/** pi's key format; two modifier levels covers every practical binding without the compiler cost. */
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

/** What `mod` means on `platform` — `super` (Cmd) on Apple hardware, `ctrl` everywhere else. */
export const primaryModifier = (platform: string): "super" | "ctrl" =>
  /mac|iphone|ipad|ipod/i.test(platform) ? "super" : "ctrl";

/** Resolved once: the platform does not change under a running page. */
const MOD = primaryModifier(typeof navigator === "undefined" ? "" : navigator.platform);

/** Match a keyboard event against pi's `KeyId` format (`"ctrl+shift+p"`).
 * Modifiers must match exactly, so `ctrl+p` does not fire on `ctrl+shift+p`. */
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
