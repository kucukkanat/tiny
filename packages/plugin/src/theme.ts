import type { ThemeLike } from "./types.ts";

/**
 * pi extensions call `ctx.ui.theme` inline while building strings, e.g.
 * `theme.fg("accent", "●")`. There is no ANSI in a browser, so every method
 * returns the text untouched: styling degrades to plain text instead of
 * throwing on an absent property.
 */
export const identityTheme: ThemeLike = {
  name: "react",
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
  italic: (text) => text,
  underline: (text) => text,
  inverse: (text) => text,
  strikethrough: (text) => text,
  getFgAnsi: () => "",
  getBgAnsi: () => "",
  getColorMode: () => "truecolor",
};
