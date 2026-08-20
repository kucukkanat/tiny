import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../src/build.ts";
import { pages, type SearchEntry } from "../src/site.ts";

let out = "";
const html = new Map<string, string>();

/** `dist/foo/index.html` → the URL a link on another page would use: `foo/`. */
const urlOf = (path: string) => (path === "index.html" ? "" : path.replace(/index\.html$/, ""));

beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), "tiny-docs-"));
  const written = await build(out);
  for (const path of written) html.set(urlOf(path), await readFile(join(out, path), "utf8"));
});

afterAll(async () => {
  await rm(out, { recursive: true, force: true });
});

const hrefsIn = (page: string): readonly string[] =>
  [...page.matchAll(/href="([^"]+)"/g)].map(([, href]) => href ?? "");

const idsIn = (page: string): ReadonlySet<string> =>
  new Set([...page.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id ?? ""));

/** Resolves an href written on `from` against the site root, as a browser would. */
const resolve = (from: string, href: string): string => {
  const base = from === "" ? "" : from;
  const segments = [...base.split("/").filter(Boolean), ...href.split("/")];
  const stack: string[] = [];
  // A trailing segment of "" means the href ended in "/", i.e. a directory.
  for (const segment of segments) {
    if (segment === "..") stack.pop();
    else if (segment !== "." && segment !== "") stack.push(segment);
  }
  const trailing = href.endsWith("/") || href === "";
  return stack.join("/") + (trailing && stack.length > 0 ? "/" : "");
};

describe("build", () => {
  test("writes one page per entry in the site index", () => {
    expect([...html.keys()].sort()).toEqual(
      pages.map((page) => (page.slug === "" ? "" : `${page.slug}/`)).sort(),
    );
  });

  test("ships the assets every page references", async () => {
    for (const asset of ["docs.css", "docs.js", "tokens.css", "icon.svg", "search.json"])
      expect(await Bun.file(join(out, "assets", asset)).exists()).toBe(true);
    // Without this, Pages runs Jekyll and drops underscore-prefixed paths.
    expect(await Bun.file(join(out, ".nojekyll")).exists()).toBe(true);
  });

  test("uses the design tokens the chat app renders against, not a copy", async () => {
    const shipped = await readFile(join(out, "assets", "tokens.css"), "utf8");
    const source = await readFile(
      join(import.meta.dir, "..", "..", "..", "packages", "ui", "src", "tokens.css"),
      "utf8",
    );
    expect(shipped).toBe(source);
  });
});

describe("links", () => {
  test("every internal href resolves to a page that was built", () => {
    const broken: string[] = [];
    for (const [from, page] of html) {
      for (const href of hrefsIn(page)) {
        if (/^(https?:|mailto:|#)/.test(href)) continue;
        const target = resolve(from, href.split("#")[0] ?? "");
        // `app/` is the chat app, mounted beside the docs at deploy time.
        if (target === "app/" || target.startsWith("assets/")) continue;
        if (!html.has(target)) broken.push(`${from || "/"} → ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  test("every cross-page anchor points at a heading that exists", () => {
    const anchors = new Map([...html].map(([url, page]) => [url, idsIn(page)]));
    const broken: string[] = [];
    for (const [from, page] of html) {
      for (const href of hrefsIn(page)) {
        if (/^(https?:|mailto:)/.test(href)) continue;
        const [path = "", hash] = href.split("#");
        if (hash === undefined || hash === "") continue;
        const target = path === "" ? from : resolve(from, path);
        if (target === "app/") continue;
        if (anchors.get(target)?.has(hash) !== true) broken.push(`${from || "/"} → ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  test("no page hard-codes an absolute path, so any base path works", () => {
    const absolute: string[] = [];
    for (const [from, page] of html)
      for (const href of hrefsIn(page))
        if (href.startsWith("/")) absolute.push(`${from || "/"} → ${href}`);
    expect(absolute).toEqual([]);
  });
});

describe("chrome", () => {
  test("each page marks itself current in the sidebar exactly once", () => {
    for (const page of html.values())
      expect(page.match(/aria-current="page"/g)?.length ?? 0).toBe(1);
  });

  test("each page has a unique title and a description", () => {
    const titles = new Set<string>();
    for (const page of html.values()) {
      const title = page.match(/<title>([^<]+)<\/title>/)?.[1];
      expect(title).toBeDefined();
      titles.add(title ?? "");
      expect(page).toMatch(/<meta name="description" content="[^"]+"/);
    }
    expect(titles.size).toBe(html.size);
  });

  test("wide tables scroll inside themselves rather than the page", () => {
    const runtime = html.get("runtime/") ?? "";
    expect(runtime).toContain('<div class="table-scroll"><table>');
    expect(runtime.match(/<table>/g)?.length).toBe(
      runtime.match(/<div class="table-scroll">/g)?.length,
    );
  });

  test("the home page's card grid is generated from the site index", () => {
    const home = html.get("") ?? "";
    expect(home).toContain('<ul class="cards">');
    for (const page of pages.filter((candidate) => candidate.slug !== ""))
      expect(home).toContain(`<strong>${page.title}</strong>`);
  });
});

describe("search index", () => {
  test("covers every page, with its headings", async () => {
    const index = (await Bun.file(join(out, "assets", "search.json")).json()) as SearchEntry[];
    expect(index).toHaveLength(pages.length);
    for (const entry of index) {
      expect(entry.title).not.toBe("");
      expect(entry.headings.length).toBeGreaterThan(0);
    }
  });

  test("every indexed heading anchor exists on the page it points at", async () => {
    const index = (await Bun.file(join(out, "assets", "search.json")).json()) as SearchEntry[];
    for (const entry of index) {
      const ids = idsIn(html.get(entry.url) ?? "");
      for (const heading of entry.headings) expect(ids.has(heading.id)).toBe(true);
    }
  });
});
