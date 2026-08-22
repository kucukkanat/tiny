/** pi's `Theme` class, reduced to the string-in/string-out methods. */
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

/** No ANSI in a browser, so every method returns the text untouched. */
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
