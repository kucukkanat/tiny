import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, screen } from "@testing-library/react";
import { type ToolDefinition, toolOutput } from "@tiny/ai";
import { definePlugin, type Plugin } from "@tiny/plugin";
import { approvalLog } from "@tiny/plugin-trace";
import { type ApprovalDecided, approvalDecided, humanInTheLoop } from "../src/index.ts";
import { createServer, forgetHost, mount, reply } from "./harness.tsx";

// Two plugins composing over `tiny.events`, through the whole real path: a
// server answers with a tool call, the approval plugin settles it, and a
// separate plugin — which imports one channel and nothing else — hears the
// outcome. The bus had no callers at all before this.

const server = createServer("fs_write", { path: "/notes.md", content: "hi" });
afterAll(() => server.stop());

afterEach(() => {
  cleanup();
  forgetHost();
  localStorage.clear();
  server.reset();
});

const fsWrite: ToolDefinition = {
  name: "fs_write",
  description: "Write a file",
  parameters: {
    type: "object",
    properties: { path: { type: "string" }, content: { type: "string" } },
    required: ["path", "content"],
  },
  execute: () => toolOutput("wrote /notes.md"),
};
const registersTool: Plugin = (tiny) => tiny.registerTool(fsWrite);

/** A subscriber written the way a third party would write one. */
const listens = (into: ApprovalDecided[]) =>
  definePlugin("listener", (tiny) => {
    // `decided` is typed from the channel, not asserted — the publisher's
    // contract, imported.
    tiny.events.on(approvalDecided, (decided) => void into.push(decided));
  });

const choose = async (option: "approve" | "deny") => {
  await act(async () => screen.getByTestId(`approval-option-${option}`).click());
  await act(async () => screen.getByTestId("approval-send").click());
};

describe("the approval channel", () => {
  test("carries the user's answer to a plugin that never heard of this one", async () => {
    const heard: ApprovalDecided[] = [];
    await mount([humanInTheLoop(), registersTool, listens(heard)]);
    const { finished } = reply(server.endpoint);

    await screen.findByTestId("approval-card");
    await choose("approve");
    await finished;

    expect(heard).toEqual([{ toolName: "fs_write", approved: true, by: "user" }]);
  });

  test("reports a denial with the reason the model was given", async () => {
    const heard: ApprovalDecided[] = [];
    await mount([humanInTheLoop({ denyReason: "Not this time." }), registersTool, listens(heard)]);
    const { finished } = reply(server.endpoint);

    await screen.findByTestId("approval-card");
    await choose("deny");
    await finished;

    expect(heard).toEqual([
      { toolName: "fs_write", approved: false, by: "user", reason: "Not this time." },
    ]);
  });

  test("reports a call allowed by policy, which nobody was asked about", async () => {
    const heard: ApprovalDecided[] = [];
    await mount([humanInTheLoop({ allow: ["fs_write"] }), registersTool, listens(heard)]);
    const { finished } = reply(server.endpoint);
    await finished;

    // No card was ever shown, and an audit that omitted this would be wrong
    // about what the model was allowed to do.
    expect(screen.queryByTestId("approval-card")).toBeNull();
    expect(heard).toEqual([{ toolName: "fs_write", approved: true, by: "policy" }]);
  });

  test("the shipped subscriber turns it into a line of log", async () => {
    const lines: string[] = [];
    await mount([
      humanInTheLoop({ allow: ["fs_write"] }),
      registersTool,
      approvalLog((l) => void lines.push(l)),
    ]);
    const { finished } = reply(server.endpoint);
    await finished;

    expect(lines).toEqual(["[approval] fs_write allowed (by policy)"]);
  });

  test("the subscriber is silent when nothing publishes", async () => {
    const lines: string[] = [];
    // No approval plugin in the list at all: the tool runs unguarded and the
    // channel has no publisher.
    await mount([registersTool, approvalLog((l) => void lines.push(l))]);
    const { finished } = reply(server.endpoint);
    await finished;

    expect(lines).toEqual([]);
  });
});
