import { describe, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Glob } from "bun";
import { pages } from "../src/site.ts";

const contentDir = join(import.meta.dir, "..", "content");
const repoRoot = join(import.meta.dir, "..", "..", "..");

type Embedded = { readonly page: string; readonly path: string; readonly code: string };

/** Every markdown file in the repo that may quote source: the site, and every README. */
const sources = async (): Promise<readonly { name: string; markdown: string }[]> => {
  const site = await Promise.all(
    pages.map(async (page) => ({
      name: page.file,
      markdown: await readFile(join(contentDir, page.file), "utf8"),
    })),
  );
  const readmes = await Promise.all(
    [...new Glob("**/README.md").scanSync({ cwd: repoRoot })]
      .filter((file) => !file.includes("node_modules"))
      .map(async (file) => ({
        name: file,
        markdown: await readFile(join(repoRoot, file), "utf8"),
      })),
  );
  return [...site, ...readmes];
};

/**
 * Fenced blocks annotated ```lang path=<repo-relative file> claim to be that
 * file. Collecting them here is what lets the assertion below hold the prose to
 * it, so a snippet cannot rot into something that no longer compiles or runs.
 *
 * READMEs are included deliberately: they drifted from the code precisely
 * because only the site was checked.
 */
const embedded = async (): Promise<readonly Embedded[]> => {
  const found: Embedded[] = [];
  for (const { name, markdown } of await sources()) {
    // Four-backtick blocks quote the annotation itself while explaining it, so
    // what is inside them is an illustration rather than a claim.
    const prose = markdown.replace(/^````[\s\S]*?^````$/gm, "");
    const fences = prose.matchAll(/^```[a-z]+ path=(\S+)\n([\s\S]*?)^```$/gm);
    for (const [, path, code] of fences)
      found.push({ page: name, path: path ?? "", code: code ?? "" });
  }
  return found;
};

describe("embedded source", () => {
  test("the docs embed at least one real file per code-bearing area", async () => {
    const found = await embedded();
    const files = new Set(found.map((entry) => entry.path));
    // Guards against the check silently passing because the annotations were
    // dropped along with the snippets.
    expect(files.size).toBeGreaterThanOrEqual(5);
  });

  test("every annotated snippet is the file it names, verbatim", async () => {
    for (const { page, path, code } of await embedded()) {
      const source = await readFile(join(repoRoot, path), "utf8");
      expect(`${page} → ${path}\n${code}`).toBe(`${page} → ${path}\n${source}`);
    }
  });
});

/**
 * Repo paths named in prose, as `apps/…` or `packages/…` inside backticks.
 *
 * Fenced blocks are stripped first: code is held to the file it names by the
 * assertions above, and a path inside an example is part of that example.
 * Anything with a glob or an ellipsis is a description of several files rather
 * than a claim about one.
 */
const mentionedPaths = async (): Promise<readonly { page: string; path: string }[]> => {
  const found: { page: string; path: string }[] = [];
  for (const { name, markdown } of await sources()) {
    const prose = markdown.replace(/^````?[\s\S]*?^````?$/gm, "");
    for (const [, span] of prose.matchAll(/`([^`\n]+)`/g)) {
      const path = span ?? "";
      if (!/^(apps|packages|scripts|test)\/[\w./@-]+$/.test(path)) continue;
      found.push({ page: name, path });
    }
  }
  return found;
};

describe("prose paths", () => {
  test("names enough repo paths for the check below to mean anything", async () => {
    // Guards against the assertion passing because the regex stopped matching.
    expect(new Set((await mentionedPaths()).map((entry) => entry.path)).size).toBeGreaterThan(10);
  });

  /**
   * A path in prose is either a file a reader opens or one the quickstart tells
   * them to create, so the file itself may legitimately not exist yet — but the
   * directory holding it always does. Requiring the parent is what catches the
   * failure this test was written for: three pages sent new authors to
   * `apps/chat/src/plugins/index.ts`, and `apps/chat/src/plugins/` has never
   * existed. The registry is the flat `apps/chat/src/plugins.ts`.
   */
  test("every repo path named in prose is somewhere that exists", async () => {
    const there = async (path: string): Promise<boolean> =>
      (await stat(path).then(
        () => true,
        () => false,
      )) satisfies boolean;

    const broken: string[] = [];
    for (const { page, path } of await mentionedPaths()) {
      // A README may name a path relative to its own package, so try there too.
      const bases = [repoRoot, join(repoRoot, page, "..")];
      const candidates = bases.flatMap((base) => [join(base, path), join(base, path, "..")]);
      if (await Promise.all(candidates.map(there)).then((hits) => hits.includes(true))) continue;
      broken.push(`${page} → ${path}`);
    }
    expect(broken).toEqual([]);
  });
});

describe("content", () => {
  test("every page starts with a single h1", async () => {
    for (const page of pages) {
      const markdown = await readFile(join(contentDir, page.file), "utf8");
      expect(markdown.startsWith("# ")).toBe(true);
      expect(markdown.match(/^# /gm)).toHaveLength(1);
    }
  });

  test("internal markdown links name a page that exists", async () => {
    const known = new Set(pages.map((page) => page.file));
    const broken: string[] = [];
    for (const page of pages) {
      const markdown = await readFile(join(contentDir, page.file), "utf8");
      for (const [, href] of markdown.matchAll(/\]\(([^)\s]+\.md[^)\s]*)\)/g)) {
        // A link to another project's file is that project's to keep working.
        if (/^[a-z]+:\/\//.test(href ?? "")) continue;
        const file = (href ?? "").split("#")[0] ?? "";
        if (!known.has(file)) broken.push(`${page.file} → ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
