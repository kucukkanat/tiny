import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, screen } from "@testing-library/react";
import type { ToolDefinition } from "@tiny/ai";
import { toolOutput } from "@tiny/ai";
import type { Plugin } from "@tiny/plugin";
import { plugins as asksForEverything } from "../examples/askForEverything.ts";
import { plugins as decidesOnArguments } from "../examples/decideOnArguments.ts";
import { plugins as readsAreFree } from "../examples/readsAreFree.ts";
import { cardIsOpen, createServer, forgetHost, mount, reply } from "./harness.tsx";

// Every README snippet is a real file under examples/. Running each one proves
// the snippet works, and the README is then asserted to embed the file verbatim
// so a snippet cannot rot into something that does not.

const EXAMPLES = [
  "askForEverything.ts",
  "readsAreFree.ts",
  "decideOnArguments.ts",
  "piPermissionGate.ts",
  "piProtectedPaths.ts",
] as const;

const readme = await Bun.file(new URL("../README.md", import.meta.url)).text();

const ran: string[] = [];

/** One stand-in per tool the examples name, recording that it actually ran. */
const tool = (name: string): ToolDefinition => ({
  name,
  description: `The ${name} tool`,
  parameters: { type: "object", properties: { path: { type: "string" } } },
  execute: () => {
    ran.push(name);
    return toolOutput("ok");
  },
});

const registers =
  (...names: readonly string[]): Plugin =>
  (pi) => {
    for (const name of names) pi.registerTool(tool(name));
  };

const write = createServer("fs_write", { path: "/notes.md" });
const read = createServer("fs_read", { path: "/notes.md" });
const remove = createServer("fs_delete", { path: "/notes.md" });
const scratch = createServer("fs_write", { path: "/scratch/notes.md" });
const secret = createServer("fs_write", { path: "/home/.env" });
const servers = [write, read, remove, scratch, secret];

afterAll(() => {
  for (const server of servers) server.stop();
});

afterEach(() => {
  cleanup();
  forgetHost();
  localStorage.clear();
  ran.length = 0;
  for (const server of servers) server.reset();
});

describe("examples run", () => {
  test("askForEverything stops on a plain write", async () => {
    await mount([...asksForEverything, registers("fs_write")]);
    const { finished } = reply(write.endpoint);

    expect(await screen.findByTestId("approval-card")).toBeDefined();
    await act(async () => screen.getByTestId("approval-option-deny").click());
    await act(async () => screen.getByTestId("approval-send").click());
    await finished;
    expect(ran).toEqual([]);
  });

  test("readsAreFree lets a read through and refuses a delete, neither asking", async () => {
    await mount([...readsAreFree, registers("fs_read", "fs_delete")]);
    await reply(read.endpoint).finished;
    expect(ran).toEqual(["fs_read"]);
    expect(cardIsOpen()).toBe(false);

    ran.length = 0;
    await reply(remove.endpoint).finished;
    expect(ran).toEqual([]);
    expect(cardIsOpen()).toBe(false);
  });

  test("decideOnArguments reads the path, not just the tool name", async () => {
    await mount([...decidesOnArguments, registers("fs_write")]);
    await reply(scratch.endpoint).finished;
    expect(ran).toEqual(["fs_write"]);

    ran.length = 0;
    await reply(secret.endpoint).finished;
    expect(ran).toEqual([]);
    expect(secret.lastToolResult()).toMatchObject({
      content: "That path is off limits — pick somewhere under /scratch.",
    });
  });
});

describe("README", () => {
  for (const name of EXAMPLES) {
    test(`embeds ${name} verbatim`, async () => {
      const source = await Bun.file(new URL(`../examples/${name}`, import.meta.url)).text();
      expect(readme).toContain(source.trim());
      // The file is named next to its snippet, so a reader can open it.
      expect(readme).toContain(`examples/${name}`);
    });
  }
});
