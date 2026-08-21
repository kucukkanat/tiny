/* ------------------------------------------------------------------ *
 * Theme — pi's `Theme` class, reduced to the string-in/string-out methods.
 * ------------------------------------------------------------------ */

/**
 * `ctx.ui.theme` is a live property in pi and extensions call it inline
 * (`theme.fg("accent", "●")`). A browser has no ANSI, so every method is the
 * identity — a pi extension styling a string gets its string back unstyled
 * rather than a crash.
 */
export type ThemeLike = {
  readonly name?: string | undefined;
  fg(color: string, text: string): string;
  bg(color: string, text: string): string;
  bold(text: string): string;
  italic(text: string): string;
  underline(text: string): string;
  inverse(text: string): string;
  strikethrough(text: string): string;
  getFgAnsi(color: string): string;
  getBgAnsi(color: string): string;
  getColorMode(): "truecolor" | "256color";
};

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
