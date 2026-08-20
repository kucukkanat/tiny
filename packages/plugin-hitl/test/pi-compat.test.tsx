import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, screen } from "@testing-library/react";
import type { ToolDefinition } from "@tiny/ai";
import { toolOutput } from "@tiny/ai";
import type { Plugin } from "@tiny/plugin";
import { loadPlugins } from "@tiny/plugin";
import piPermissionGate from "../examples/piPermissionGate.ts";
import piProtectedPaths from "../examples/piProtectedPaths.ts";
import { answer, createServer, forgetHost, mount, reply } from "./harness.tsx";

// pi's shipped permission gates, run here. The only edit either one carries is
// its import line, so what these tests actually check is that the `tool_call`
// contract — `event.input`, `ctx.hasUI`, `ctx.ui`, `{ block, reason }` — behaves
// the way an extension written for pi expects.

let ran = false;

const bash: ToolDefinition = {
  name: "bash",
  description: "Run a shell command",
  parameters: {
    type: "object",
    properties: { command: { type: "string" } },
    required: ["command"],
  },
  execute: (_id, params) => {
    ran = true;
    return toolOutput(`ran ${String(params.command)}`);
  },
};

const registersBash: Plugin = (pi) => pi.registerTool(bash);

const dangerous = createServer("bash", { command: "sudo rm -rf /" });
const harmless = createServer("bash", { command: "ls -la" });
afterAll(() => {
  dangerous.stop();
  harmless.stop();
});

afterEach(() => {
  cleanup();
  forgetHost();
  localStorage.clear();
  dangerous.reset();
  harmless.reset();
  ran = false;
});

describe("pi's permission-gate example, ported by its import line alone", () => {
  test("prompts through this host's dialog and runs the command on Yes", async () => {
    await mount([piPermissionGate, registersBash]);
    const { deltas, finished } = reply(dangerous.endpoint);

    // pi asks with `ctx.ui.select`, which is a real dialog here.
    expect(await screen.findByTestId("dialog-option-Yes")).toBeDefined();
    expect(screen.getByTestId("plugin-dialog").textContent).toContain("sudo rm -rf /");
    expect(ran).toBe(false);

    await act(async () => screen.getByTestId("dialog-option-Yes").click());
    await finished;
    expect(ran).toBe(true);
    expect(answer(deltas)).toBe("done");
  });

  test("blocks on No, with pi's reason reaching the model", async () => {
    await mount([piPermissionGate, registersBash]);
    const { finished } = reply(dangerous.endpoint);
    await screen.findByTestId("dialog-option-No");
    await act(async () => screen.getByTestId("dialog-option-No").click());
    await finished;

    expect(ran).toBe(false);
    expect(dangerous.lastToolResult()).toMatchObject({ content: "Blocked by user" });
  });

  test("leaves a harmless command alone", async () => {
    await mount([piPermissionGate, registersBash]);
    const { finished } = reply(harmless.endpoint);
    await finished;

    expect(ran).toBe(true);
    expect(screen.queryByTestId("plugin-dialog")).toBeNull();
  });

  test("blocks without a UI, which is the branch pi's ctx.hasUI guards", async () => {
    // `loadPlugins` with no host is pi's non-interactive mode: every ui method
    // is there, nothing can be asked, and the gate is expected to notice.
    const { extensions } = await loadPlugins([piPermissionGate]);
    let handler: ((event: unknown, ctx: unknown) => unknown) | undefined;
    for (const extension of extensions)
      await extension({
        on: (_event: string, registered: (event: unknown, ctx: unknown) => unknown) => {
          handler = registered;
        },
      } as never);

    const blocked = await handler?.(
      {
        type: "tool_call",
        toolCallId: "c1",
        toolName: "bash",
        input: { command: "sudo rm -rf /" },
      },
      { model: undefined, signal: undefined },
    );
    expect(blocked).toEqual({
      block: true,
      reason: "Dangerous command blocked (no UI for confirmation)",
    });
  });
});

describe("pi's protected-paths example", () => {
  const writes = createServer("write", { path: ".env", content: "KEY=1" });
  afterAll(() => writes.stop());

  const write: ToolDefinition = {
    name: "write",
    description: "Write a file",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    execute: () => {
      ran = true;
      return toolOutput("written");
    },
  };

  test("blocks the write and warns, without asking anyone", async () => {
    await mount([piProtectedPaths, (pi) => pi.registerTool(write)]);
    const { deltas, finished } = reply(writes.endpoint);
    // Inside `act`: this gate answers itself, and the `ctx.ui.notify` it raises
    // on the way is a React update that belongs in the act scope.
    await act(async () => {
      await finished;
    });

    expect(ran).toBe(false);
    expect(writes.lastToolResult()).toMatchObject({ content: 'Path ".env" is protected' });
    // `ctx.ui.notify` is fire-and-forget in pi, and a toast here.
    expect(screen.getByTestId("plugin-toast").textContent).toContain(".env");
    expect(answer(deltas)).toBe("done");
    writes.reset();
  });
});
