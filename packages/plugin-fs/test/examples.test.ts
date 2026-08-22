import { describe, expect, test } from "bun:test";
import { runExample } from "../../../test/helpers.ts";

// Every README snippet is a real file under examples/. Each is executed as a
// subprocess and its output checked, and the README is then asserted to embed
// the file verbatim — so a snippet cannot rot into something that no longer runs.

// Every example here is run, so the snippet a reader copies is one that works.
// That it *is* the snippet is asserted centrally by apps/docs/test/examples.test.ts,
// over every `path=` fence in the repo — READMEs included.
const run = (name: string) => runExample(new URL(`../examples/${name}`, import.meta.url));

describe("examples run", () => {
  test("register.ts lists every registered tool", async () => {
    const { stdout, exitCode } = await run("register.ts");
    expect(exitCode).toBe(0);
    for (const name of ["fs_list", "fs_read", "fs_write", "fs_edit", "fs_delete"])
      expect(stdout).toContain(name);
  });

  test("tools-in-action.ts writes, lists, reads, edits and deletes", async () => {
    const { stdout, exitCode } = await run("tools-in-action.ts");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Wrote 20 character(s) to /notes/todo.md");
    expect(stdout).toContain("todo.md");
    expect(stdout).toContain("buy oat milk");
    expect(stdout).toContain("Deleted /notes");
  });

  test("scoped-root.ts confines writes to the subdirectory", async () => {
    const { stdout, exitCode } = await run("scoped-root.ts");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("/workspace/notes/todo.md → buy milk");
  });
});
