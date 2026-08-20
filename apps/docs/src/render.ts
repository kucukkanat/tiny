import { Marked, type Tokens } from "marked";
import { type BundledLanguage, createHighlighter, type Highlighter } from "shiki";
import { escapeHtml, hrefFrom, type Page, pages } from "./site.ts";

export type Heading = { readonly id: string; readonly text: string; readonly depth: 2 | 3 };
export type Rendered = {
  readonly html: string;
  readonly headings: readonly Heading[];
  /** Markup stripped, collapsed to one line — what the search index matches against. */
  readonly plain: string;
};

/**
 * Only the languages the docs actually use. Shiki loads a grammar per language
 * and they are not small; an unlisted language falls back to plain text rather
 * than growing the build.
 */
const LANGUAGES = ["ts", "tsx", "js", "jsx", "json", "bash", "html", "css"] as const;
const isSupported = (lang: string): lang is BundledLanguage =>
  (LANGUAGES as readonly string[]).includes(lang);

/**
 * Both themes are emitted at once as `--shiki-light` / `--shiki-dark` custom
 * properties, so a code block follows the reader's colour scheme without any
 * JavaScript and without re-highlighting.
 */
const highlighterPromise: Promise<Highlighter> = createHighlighter({
  themes: ["github-light", "github-dark-dimmed"],
  langs: [...LANGUAGES],
});

export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** `<h2>Foo</h2>` etc. carry no text of their own here, so tags simply go. */
const stripTags = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Renders one content file.
 *
 * `marked` renderers are synchronous and Shiki's highlighter is not, so code is
 * highlighted in an async `walkTokens` pass first and stashed in a map the
 * renderer reads back. Keying on language and source keeps the map honest
 * without mutating marked's token objects.
 */
export const renderMarkdown = async (markdown: string, page: Page): Promise<Rendered> => {
  const highlighter = await highlighterPromise;
  const highlighted = new Map<string, string>();
  const headings: Heading[] = [];
  const key = (lang: string, text: string) => `${lang}\u0000${text}`;

  const marked = new Marked({ gfm: true });
  marked.use({
    async: true,
    walkTokens: (token) => {
      if (token.type !== "code") return;
      const code = token as Tokens.Code;
      const lang = (code.lang ?? "").split(/\s+/)[0] ?? "";
      highlighted.set(
        key(lang, code.text),
        highlighter.codeToHtml(code.text, {
          lang: isSupported(lang) ? lang : "text",
          themes: { light: "github-light", dark: "github-dark-dimmed" },
          defaultColor: false,
        }),
      );
    },
    renderer: {
      code({ text, lang }) {
        const language = (lang ?? "").split(/\s+/)[0] ?? "";
        const markup = highlighted.get(key(language, text));
        const label =
          language === "" ? "" : `<span class="code-lang">${escapeHtml(language)}</span>`;
        const body = markup ?? `<pre class="shiki"><code>${escapeHtml(text)}</code></pre>`;
        return `<figure class="code">${label}${body}</figure>`;
      },
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        if (depth !== 2 && depth !== 3) return `<h${depth}>${text}</h${depth}>`;
        const id = slugify(stripTags(text));
        headings.push({ id, text: stripTags(text), depth });
        // The anchor is a sibling rather than a wrapper so that clicking the
        // heading text itself still selects it.
        return `<h${depth} id="${id}">${text}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${depth}>`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const resolved = resolveHref(href, page);
        const external = /^https?:/.test(resolved);
        const attributes = [
          `href="${escapeHtml(resolved)}"`,
          title == null ? "" : `title="${escapeHtml(title)}"`,
          external ? 'target="_blank" rel="noreferrer noopener"' : "",
        ]
          .filter((attribute) => attribute !== "")
          .join(" ");
        return `<a ${attributes}>${text}</a>`;
      },
    },
  });

  const html = await marked.parse(markdown);
  return { html, headings, plain: stripTags(html) };
};

/**
 * Internal links are written the way GitHub renders them — `slots.md` — so the
 * content files stay readable in the repo, and are rewritten here to the
 * relative URL of the built page. Relative (never absolute) so the site works
 * unchanged at `/`, at `/tiny/`, or from a `file://` directory.
 */
export const resolveHref = (href: string, from: Page): string => {
  const [path = "", hash] = href.split("#");
  if (path === "") return href;
  if (/^[a-z]+:/.test(path) || path.startsWith("/")) return href;
  const target = pages.find((candidate) => candidate.file === path);
  if (target === undefined) return href;
  return `${hrefFrom(from, target)}${hash === undefined ? "" : `#${hash}`}`;
};
