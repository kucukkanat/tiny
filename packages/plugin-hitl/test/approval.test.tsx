import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ToolDefinition } from "@tiny/ai";
import { toolOutput } from "@tiny/ai";
import type { Plugin } from "@tiny/plugin";
import { humanInTheLoop } from "../src/index.tsx";
import { answer, cardIsOpen, createServer, forgetHost, mount, reply } from "./harness.tsx";

// The whole path, end to end and unmocked: a real server answers with a tool
// call, a real `streamChat` runs the loop, the real host renders the approval
// card, and the click on it decides whether the tool executes.

const server = createServer("fs_write", { path: "/notes.md", content: "hi" });
afterAll(() => server.stop());

afterEach(() => {
  cleanup();
  forgetHost();
  localStorage.clear();
  server.reset();
  ran = false;
});

/** Records whether the tool actually ran, which is the only thing that matters. */
let ran = false;
const fsWrite: ToolDefinition = {
  name: "fs_write",
  label: "Write File",
  description: "Write a file",
  parameters: {
    type: "object",
    properties: { path: { type: "string" }, content: { type: "string" } },
    required: ["path", "content"],
  },
  execute: () => {
    ran = true;
    return toolOutput("wrote /notes.md");
  },
};
const registersTool: Plugin = (pi) => pi.registerTool(fsWrite);

/**
 * Answer the card the way a person does: choose, then send. The send is
 * deliberate rather than automatic — see `ApprovalCard` in `@tiny/ui`.
 */
const choose = async (option: "approve" | "deny") => {
  await act(async () => screen.getByTestId(`approval-option-${option}`).click());
  await act(async () => screen.getByTestId("approval-send").click());
};

describe("humanInTheLoop", () => {
  test("asks before the tool runs, showing the arguments", async () => {
    await mount([humanInTheLoop({ labels: { fs_write: "Write File" } }), registersTool]);
    const { finished } = reply(server.endpoint);

    expect(await screen.findByTestId("approval-card")).toBeDefined();
    expect(screen.getByTestId("approval-card").textContent).toContain("/notes.md");
    // Named by its label rather than its wire name, as the model's request is
    // not what the user is being asked about.
    expect(screen.getByTestId("approval-card").textContent).toContain("Write File");
    // Nothing has run while the question is open.
    expect(ran).toBe(false);

    await choose("approve");
    await finished;
    expect(ran).toBe(true);
  });

  test("approving lets the loop finish normally", async () => {
    await mount([humanInTheLoop(), registersTool]);
    const { deltas, finished } = reply(server.endpoint);
    await screen.findByTestId("approval-card");
    await choose("approve");
    await finished;

    expect(answer(deltas)).toBe("done");
    expect(server.lastToolResult()).toMatchObject({ content: "wrote /notes.md" });
  });

  test("denying blocks the tool and tells the model, which still answers", async () => {
    await mount([humanInTheLoop(), registersTool]);
    const { deltas, finished } = reply(server.endpoint);
    await screen.findByTestId("approval-card");
    await choose("deny");
    await finished;

    expect(ran).toBe(false);
    // The turn survives the refusal — that is the point of blocking rather
    // than throwing.
    expect(answer(deltas)).toBe("done");
    expect(server.lastToolResult()).toMatchObject({ content: "The user declined this tool call." });
    expect(deltas.filter((d) => d.kind === "tool").at(-1)).toMatchObject({ status: "error" });
  });

  test("a typed reason reaches the model in place of the result", async () => {
    await mount([humanInTheLoop(), registersTool]);
    const { finished } = reply(server.endpoint);
    const field = await screen.findByTestId("approval-note");
    fireEvent.change(field, { target: { value: "ask me for the path first" } });
    await choose("deny");
    await finished;

    expect(server.lastToolResult()).toMatchObject({ content: "ask me for the path first" });
  });

  test("dismissing the card denies, because a closed question is not consent", async () => {
    await mount([humanInTheLoop(), registersTool]);
    const { finished } = reply(server.endpoint);
    await screen.findByTestId("approval-card");
    await act(async () => screen.getByTestId("approval-dismiss").click());
    await finished;

    expect(ran).toBe(false);
    expect(server.lastToolResult()).toMatchObject({ content: "The user declined this tool call." });
  });

  test("remembering an answer stops it asking again", async () => {
    await mount([humanInTheLoop(), registersTool]);
    const first = reply(server.endpoint);
    await screen.findByTestId("approval-card");
    await act(async () => screen.getByTestId("approval-remember").click());
    await choose("approve");
    await first.finished;

    server.reset();
    ran = false;
    const second = reply(server.endpoint);
    await second.finished;
    expect(ran).toBe(true);
    expect(cardIsOpen()).toBe(false);
  });

  test("an allowed tool never asks at all", async () => {
    await mount([humanInTheLoop({ allow: ["fs_write"] }), registersTool]);
    const { deltas, finished } = reply(server.endpoint);
    await finished;

    expect(ran).toBe(true);
    expect(answer(deltas)).toBe("done");
    expect(cardIsOpen()).toBe(false);
  });

  test("a denied tool is refused without asking", async () => {
    await mount([humanInTheLoop({ deny: ["fs_write"] }), registersTool]);
    const { finished } = reply(server.endpoint);
    await finished;

    expect(ran).toBe(false);
    expect(cardIsOpen()).toBe(false);
    expect(server.lastToolResult()).toMatchObject({ content: "The user declined this tool call." });
  });

  test("decide() sees the arguments, which is what the lists cannot do", async () => {
    const guard = humanInTheLoop({
      decide: ({ input }) => (String(input.path).startsWith("/notes") ? "allow" : "ask"),
    });
    await mount([guard, registersTool]);
    const { finished } = reply(server.endpoint);
    await finished;

    expect(ran).toBe(true);
    expect(cardIsOpen()).toBe(false);
  });

  test("stopping the reply dismisses the card instead of stranding it", async () => {
    await mount([humanInTheLoop(), registersTool]);
    const controller = new AbortController();
    const { finished } = reply(server.endpoint, controller.signal);
    await screen.findByTestId("approval-card");

    // Asserted before aborting: the rejection lands during `abort()`, and a
    // promise nobody is watching yet counts as an unhandled one.
    const outcome = finished.then(
      () => undefined,
      (error: unknown) => error,
    );
    await act(async () => controller.abort());
    // The request fails on the abort itself, rather than reporting a refusal
    // the user never made.
    expect(await outcome).toMatchObject({ name: "AbortError" });
    expect(ran).toBe(false);
    // Stopping ends the request rather than telling the model it was refused.
    expect(server.state.requests.length).toBe(1);
    await waitFor(() => expect(cardIsOpen()).toBe(false));
  });
});
