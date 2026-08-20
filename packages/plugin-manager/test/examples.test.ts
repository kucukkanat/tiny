import { describe, expect, test } from "bun:test";

// Every README snippet is a real file under examples/. Each is executed as a
// subprocess and its output checked, and the README is then asserted to embed
// the file verbatim — so a snippet cannot rot into something that no longer runs.

// Every example here is run, so the snippet a reader copies is one that works.
// That it *is* the snippet is asserted centrally by apps/docs/test/examples.test.ts,
// over every `path=` fence in the repo — READMEs included.
const run = async (name: string) => {
  const path = new URL(`../examples/${name}`, import.meta.url).pathname;
  const proc = Bun.spawn(["bun", "run", path], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
};

describe("examples run", () => {
  test("install-from-source.ts loads a pasted plugin into the app's registry", async () => {
    const { stdout, exitCode } = await run("install-from-source.ts");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("installed Word count");
    expect(stdout).toContain("commands: plugins, words");
    // Disabling really unloads it.
    expect(stdout).toContain("disabled: plugins");
  });

  test("install-from-url.ts pins the fetched source and refuses a tampered copy", async () => {
    const { stdout, exitCode } = await run("install-from-url.ts");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("commands: plugins, greet");
    expect(stdout).toContain("status: modified");
    // The last line is the registry after tampering: the plugin is gone.
    expect(stdout.trimEnd().endsWith("commands: plugins")).toBe(true);
    expect(stdout).not.toContain("this should never run");
  });
});
