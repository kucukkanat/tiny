import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
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
        const file = (href ?? "").split("#")[0] ?? "";
        if (!known.has(file)) broken.push(`${page.file} → ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
