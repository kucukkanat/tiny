import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type Heading, renderMarkdown } from "./render.ts";
import { shell } from "./shell.ts";
import { hrefFrom, type Page, pages, type SearchEntry } from "./site.ts";

const here = new URL(".", import.meta.url).pathname;
const appRoot = join(here, "..");

/** Home is `index.html`; everything else is a directory index, so URLs stay bare. */
const outputPath = (page: Page): string =>
  page.slug === "" ? "index.html" : join(page.slug, "index.html");

/**
 * Wide tables must scroll inside themselves rather than pushing the page
 * sideways. Done here rather than in the renderer because marked's table
 * renderer would have to be reimplemented in full to wrap its own output.
 */
const wrapTables = (html: string): string =>
  html
    .replace(/<table>/g, '<div class="table-scroll"><table>')
    .replace(/<\/table>/g, "</table></div>");

/** The home page's link grid, generated from the site index so it cannot go stale. */
const cards = (home: Page): string =>
  `<ul class="cards">${pages
    .filter((page) => page.slug !== "")
    .map(
      (page) =>
        `<li><a href="${hrefFrom(home, page)}"><strong>${page.title}</strong><span>${page.blurb}</span></a></li>`,
    )
    .join("")}</ul>`;

const write = async (path: string, contents: string | Uint8Array): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
};

/**
 * The one page that cannot be relative. Everything else on the site links with
 * `../`, which works at any base path; a 404 is served for URLs at any depth, so
 * it carries its own styling and needs to be told where home is.
 */
const notFoundPage = (base: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>Not found · Tiny plugin docs</title>
    <style>
      :root { color-scheme: light dark; --ink: #1a1d24; --dim: #6b7280; --bg: #f5f6f8; --accent: #2f6fed; }
      @media (prefers-color-scheme: dark) {
        :root { --ink: #f1f3f6; --dim: #8a919e; --bg: #1c1e22; --accent: #6ea0f5; }
      }
      body {
        display: grid; place-content: center; gap: 12px; min-height: 100vh; margin: 0; padding: 24px;
        background: var(--bg); color: var(--ink); text-align: center;
        font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif;
      }
      h1 { margin: 0; font-size: 32px; letter-spacing: -0.02em; }
      p { margin: 0; color: var(--dim); }
      a { color: var(--accent); }
    </style>
  </head>
  <body>
    <h1>Not found</h1>
    <p>That page does not exist.</p>
    <p><a href="${base}">Back to the documentation</a></p>
  </body>
</html>
`;

/** `base` is only used by the 404 page; every other URL on the site is relative. */
export const build = async (outDir: string, base = "/"): Promise<readonly string[]> => {
  await rm(outDir, { recursive: true, force: true });

  const index: SearchEntry[] = [];
  const written: string[] = [];

  for (const page of pages) {
    const source = await readFile(join(appRoot, "content", page.file), "utf8");
    const { html, headings, plain } = await renderMarkdown(source, page);
    const body = wrapTables(html).replace("<!--cards-->", () => cards(page));
    const path = outputPath(page);
    await write(join(outDir, path), shell({ page, body, headings, description: page.blurb }));
    written.push(path);
    index.push({
      url: page.slug === "" ? "" : `${page.slug}/`,
      title: page.title,
      blurb: page.blurb,
      headings: headings.map(({ id, text }: Heading) => ({ id, text })),
      // Trimmed: the index is fetched on the first keystroke, and whole pages
      // would make it heavier than the pages themselves.
      text: plain.slice(0, 4000),
    });
  }

  await write(join(outDir, "assets", "search.json"), JSON.stringify(index));

  // One source of truth for colour: the very file the chat app renders against.
  // Resolved through the package export rather than by path, so moving the file
  // is @tiny/ui's business and this build follows it.
  await write(
    join(outDir, "assets", "tokens.css"),
    await readFile(Bun.resolveSync("@tiny/ui/tokens.css", appRoot)),
  );
  await write(join(outDir, "assets", "docs.css"), await readFile(join(here, "docs.css")));
  // The docs keep their own copy of the mark. A little copying beats reaching
  // across into another app's public/ folder, which no import graph would show.
  await write(join(outDir, "assets", "icon.svg"), await readFile(join(here, "icon.svg")));

  const client = await Bun.build({
    entrypoints: [join(here, "browser.ts")],
    minify: true,
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (!client.success) {
    for (const log of client.logs) console.error(log);
    throw new Error("Failed to bundle the docs client script");
  }
  const [bundle] = client.outputs;
  if (bundle === undefined) throw new Error("Client bundle produced no output");
  await write(join(outDir, "assets", "docs.js"), await bundle.text());

  // Served by GitHub Pages for any unresolved path, at any depth — so unlike
  // every other page it cannot use relative asset URLs, and is self-contained.
  await write(join(outDir, "404.html"), notFoundPage(base));

  // GitHub Pages runs Jekyll over the artifact unless told not to, which would
  // drop any path beginning with an underscore.
  await write(join(outDir, ".nojekyll"), "");

  return written;
};

if (import.meta.main) {
  const outDir = join(appRoot, "dist");
  const baseFlag = process.argv.find((argument) => argument.startsWith("--base="));
  const written = await build(outDir, baseFlag?.slice("--base=".length) ?? "/");
  console.log(`Built ${written.length} pages → apps/docs/dist`);

  if (process.argv.includes("--serve")) {
    const server = Bun.serve({
      port: 4321,
      fetch: async (request) => {
        const { pathname } = new URL(request.url);
        const candidates = [
          join(outDir, pathname),
          join(outDir, pathname, "index.html"),
          join(outDir, "index.html"),
        ];
        for (const candidate of candidates) {
          const file = Bun.file(candidate);
          if (await file.exists()) return new Response(file);
        }
        return new Response("Not found", { status: 404 });
      },
    });
    console.log(`Serving docs at ${server.url}`);
  }
}
