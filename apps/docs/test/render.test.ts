import { describe, expect, test } from "bun:test";
import { renderMarkdown, resolveHref, slugify } from "../src/render.ts";
import { pages } from "../src/site.ts";

const home = pages[0];
const runtime = pages.find((page) => page.slug === "runtime");
if (home === undefined || runtime === undefined) throw new Error("site is missing a page");

describe("slugify", () => {
  test("matches the ids the table of contents links to", () => {
    expect(slugify("How runtime plugins work")).toBe("how-runtime-plugins-work");
    expect(slugify("`contribute` and friends")).toBe("contribute-and-friends");
    expect(slugify("Why `@tiny/ai` needed no change")).toBe("why-tiny-ai-needed-no-change");
  });
});

describe("resolveHref", () => {
  test("rewrites a content filename to a relative page URL", () => {
    expect(resolveHref("runtime.md", home)).toBe("runtime/");
    expect(resolveHref("runtime.md", runtime)).toBe("../runtime/");
    expect(resolveHref("index.md", runtime)).toBe("../");
  });

  test("keeps the fragment", () => {
    expect(resolveHref("slots.md#errors", runtime)).toBe("../slots/#errors");
  });

  test("leaves external, absolute and bare-fragment links alone", () => {
    expect(resolveHref("https://example.com", home)).toBe("https://example.com");
    expect(resolveHref("/somewhere", home)).toBe("/somewhere");
    expect(resolveHref("#errors", home)).toBe("#errors");
  });

  test("leaves an unknown filename alone rather than inventing a page", () => {
    expect(resolveHref("nope.md", home)).toBe("nope.md");
  });
});

describe("renderMarkdown", () => {
  test("gives h2 and h3 ids and collects them in reading order", async () => {
    const { html, headings } = await renderMarkdown(
      "# Title\n\n## First\n\n### Nested\n\n## Second\n",
      home,
    );
    expect(headings).toEqual([
      { id: "first", text: "First", depth: 2 },
      { id: "nested", text: "Nested", depth: 3 },
      { id: "second", text: "Second", depth: 2 },
    ]);
    expect(html).toContain('<h2 id="first">');
    expect(html).toContain('href="#first"');
    // h1 is the page title and never appears in the sidebar, so it gets no id.
    expect(html).not.toContain("<h1 id=");
  });

  test("highlights a fenced block and labels its language", async () => {
    const { html } = await renderMarkdown("```ts\nconst x = 1;\n```\n", home);
    expect(html).toContain('<figure class="code">');
    expect(html).toContain('<span class="code-lang">ts</span>');
    expect(html).toContain("--shiki-light");
    expect(html).toContain("--shiki-dark");
  });

  test("carries the `path=` annotation without treating it as the language", async () => {
    const { html } = await renderMarkdown(
      "```ts path=packages/plugin/src/host.ts\nconst x = 1;\n```\n",
      home,
    );
    expect(html).toContain('<span class="code-lang">ts</span>');
    expect(html).toContain("--shiki-light");
  });

  test("falls back to plain text for an unknown language rather than throwing", async () => {
    const { html } = await renderMarkdown("```brainfuck\n+++.\n```\n", home);
    expect(html).toContain('<figure class="code">');
    expect(html).toContain("+++.");
  });

  test("opens external links in a new tab and internal ones in place", async () => {
    const { html } = await renderMarkdown("[a](https://example.com) [b](runtime.md)", home);
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('href="runtime/"');
    expect(html.match(/target="_blank"/g)).toHaveLength(1);
  });

  test("plain text has markup stripped, for the search index", async () => {
    const { plain } = await renderMarkdown("## Hi\n\nSome **bold** text.", home);
    expect(plain).toContain("Some bold text.");
    expect(plain).not.toContain("<");
  });
});
