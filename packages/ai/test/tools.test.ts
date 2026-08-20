import { afterAll, describe, expect, test } from "bun:test";
import type { StreamDelta, ToolDefinition } from "../src/index.ts";
import { streamChat, toolOutput } from "../src/index.ts";

// The agent loop is driven against a real in-process OpenAI-compatible server
// that answers with tool calls — no mocks, and no stand-in for the loop itself.

const sse = (payloads: unknown[]): string =>
  payloads.map((p) => `data: ${typeof p === "string" ? p : JSON.stringify(p)}\n\n`).join("");

const toolCall = (id: string, name: string, args: unknown) => ({
  choices: [
    {
      delta: {
        tool_calls: [
          { index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } },
        ],
      },
    },
  ],
});

const finish = (reason: string) => ({ choices: [{ delta: {}, finish_reason: reason }] });
const text = (content: string) => ({ choices: [{ delta: { content } }] });

/** Every request body the server saw, so the fed-back results can be inspected. */
let requests: { messages: { role: string; content: unknown }[]; tools?: unknown[] }[] = [];

const eventStream = (payloads: unknown[]) =>
  new Response(sse([...payloads, "[DONE]"]), {
    headers: { "Content-Type": "text/event-stream" },
  });

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const body = (await request.json()) as (typeof requests)[number];
    requests.push(body);
    const round = requests.length;

    // Calls one tool, then answers once the result comes back.
    if (pathname === "/once/chat/completions")
      return round === 1
        ? eventStream([toolCall("c1", "echo", { value: "hi" }), finish("tool_calls")])
        : eventStream([text("done"), finish("stop")]);

    // Two calls in a single assistant turn.
    if (pathname === "/parallel/chat/completions")
      return round === 1
        ? eventStream([
            toolCall("c1", "echo", { value: "a" }),
            {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 1,
                        id: "c2",
                        type: "function",
                        function: { name: "echo", arguments: JSON.stringify({ value: "b" }) },
                      },
                    ],
                  },
                },
              ],
            },
            finish("tool_calls"),
          ])
        : eventStream([text("both"), finish("stop")]);

    // Calls a tool that does not exist.
    if (pathname === "/unknown/chat/completions")
      return round === 1
        ? eventStream([toolCall("c1", "nope", {}), finish("tool_calls")])
        : eventStream([text("recovered"), finish("stop")]);

    // Calls a tool that throws.
    if (pathname === "/throws/chat/completions")
      return round === 1
        ? eventStream([toolCall("c1", "boom", {}), finish("tool_calls")])
        : eventStream([text("recovered"), finish("stop")]);

    // Never stops calling, so the turn cap has to end it.
    if (pathname === "/forever/chat/completions")
      return eventStream([toolCall(`c${round}`, "echo", { value: "x" }), finish("tool_calls")]);

    return new Response("not found", { status: 404 });
  },
});

afterAll(() => server.stop(true));

const endpointFor = (path: string) => ({
  baseUrl: `http://localhost:${server.port}${path}`,
  apiKey: "sk-test",
});

const echo: ToolDefinition = {
  name: "echo",
  description: "Echo a value back",
  parameters: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
  },
  execute: (_id, params) => toolOutput(`echoed:${String(params.value)}`),
};

const collect = async (path: string, tools: readonly ToolDefinition[], maxToolTurns?: number) => {
  requests = [];
  const deltas: StreamDelta[] = [];
  for await (const delta of streamChat(
    endpointFor(path),
    "test-model",
    [{ role: "user", content: "go" }],
    { tools, ...(maxToolTurns === undefined ? {} : { maxToolTurns }) },
  ))
    deltas.push(delta);
  return deltas;
};

const answer = (deltas: readonly StreamDelta[]) =>
  deltas
    .filter((delta) => delta.kind === "text")
    .map((delta) => delta.text)
    .join("");

const toolDeltas = (deltas: readonly StreamDelta[]) =>
  deltas.filter((delta) => delta.kind === "tool");

describe("the tool loop", () => {
  test("sends the tools with the request", async () => {
    await collect("/once", [echo]);
    // pi-ai adds its own fields (`strict`), so this checks the shape we supply
    // rather than pinning everything the provider layer decides to send.
    expect(requests[0]?.tools).toMatchObject([
      {
        type: "function",
        function: {
          name: "echo",
          description: "Echo a value back",
          parameters: {
            type: "object",
            properties: { value: { type: "string" } },
            required: ["value"],
          },
        },
      },
    ]);
  });

  test("omits tools entirely when none are registered", async () => {
    await collect("/once", []);
    expect(requests[0]?.tools).toBeUndefined();
  });

  test("executes the call, feeds the result back, and returns the final answer", async () => {
    const deltas = await collect("/once", [echo]);
    expect(answer(deltas)).toBe("done");
    // Two requests: the one that asked for the tool, and the one after it ran.
    expect(requests.length).toBe(2);
    const fed = requests[1]?.messages.at(-1);
    expect(fed).toMatchObject({ role: "tool", content: "echoed:hi" });
  });

  test("reports each call as running and then ok", async () => {
    const deltas = await collect("/once", [echo]);
    expect(toolDeltas(deltas)).toEqual([
      { kind: "tool", id: "c1", name: "echo", status: "running", summary: '{"value":"hi"}' },
      { kind: "tool", id: "c1", name: "echo", status: "ok", summary: "echoed:hi" },
    ]);
  });

  test("runs every call in one turn", async () => {
    const deltas = await collect("/parallel", [echo]);
    expect(answer(deltas)).toBe("both");
    expect(toolDeltas(deltas).filter((delta) => delta.status === "ok").length).toBe(2);
  });

  test("hands an unknown tool back as an error the model can recover from", async () => {
    const deltas = await collect("/unknown", [echo]);
    expect(answer(deltas)).toBe("recovered");
    expect(toolDeltas(deltas).at(-1)).toMatchObject({ status: "error" });
    expect(requests[1]?.messages.at(-1)).toMatchObject({ content: "No such tool: nope" });
  });

  test("hands a throwing tool back as an error rather than failing the request", async () => {
    const boom: ToolDefinition = {
      name: "boom",
      description: "Always fails",
      parameters: { type: "object", properties: {} },
      execute: () => {
        throw new Error("disk on fire");
      },
    };
    const deltas = await collect("/throws", [echo, boom]);
    expect(answer(deltas)).toBe("recovered");
    expect(requests[1]?.messages.at(-1)).toMatchObject({ content: "disk on fire" });
  });

  test("gives up rather than looping forever", async () => {
    expect(collect("/forever", [echo], 3)).rejects.toThrow("Gave up after 3 tool rounds");
    // The cap is what stopped it, not the server.
    expect(requests.length).toBeLessThanOrEqual(3);
  });

  test("an aborted run stops instead of reporting a tool error", async () => {
    const controller = new AbortController();
    const slow: ToolDefinition = {
      name: "echo",
      description: "Aborts mid-flight",
      parameters: { type: "object", properties: {} },
      execute: () => {
        controller.abort();
        throw new Error("cancelled");
      },
    };
    requests = [];
    const run = async () => {
      for await (const _ of streamChat(
        endpointFor("/once"),
        "test-model",
        [{ role: "user", content: "go" }],
        { tools: [slow], signal: controller.signal },
      ));
    };
    expect(run()).rejects.toThrow("cancelled");
  });
});
