import { expect } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { StreamDelta } from "@tiny/ai";
import { streamChat } from "@tiny/ai";
import type { Plugin } from "@tiny/plugin";
import { emptyRegistry, PluginHost, Slot, usePluginHost } from "@tiny/plugin";

/**
 * A real OpenAI-compatible server that asks for one tool call and then answers,
 * so the tool loop has something genuine to run. Nothing here is mocked: the
 * tests drive `streamChat` against this and click the host's own dialogs.
 */
export const createServer = (name: string, args: Record<string, unknown>) => {
  const sse = (payloads: unknown[]): string =>
    payloads.map((p) => `data: ${typeof p === "string" ? p : JSON.stringify(p)}\n\n`).join("");

  const state = { requests: [] as { messages: { role: string; content: unknown }[] }[] };

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      state.requests.push((await request.json()) as (typeof state.requests)[number]);
      const payloads =
        state.requests.length === 1
          ? [
              {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "c1",
                          type: "function",
                          function: { name, arguments: JSON.stringify(args) },
                        },
                      ],
                    },
                  },
                ],
              },
              { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
            ]
          : [
              { choices: [{ delta: { content: "done" } }] },
              { choices: [{ delta: {}, finish_reason: "stop" }] },
            ];
      return new Response(sse([...payloads, "[DONE]"]), {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });

  return {
    state,
    stop: () => server.stop(true),
    endpoint: { baseUrl: `http://localhost:${server.port}`, apiKey: "sk-test" },
    reset: () => {
      state.requests = [];
    },
    /** The tool result fed back to the model, which is where a block shows up. */
    lastToolResult: () => state.requests[1]?.messages.at(-1),
  };
};

export let host: ReturnType<typeof usePluginHost> | undefined;

function Probe() {
  host = usePluginHost();
  return null;
}

export const forgetHost = () => {
  host = undefined;
};

export const mount = async (plugins: readonly Plugin[]) => {
  host = undefined;
  // Factories resolve a microtask after the first paint; rendering inside `act`
  // keeps that second update in the act scope rather than landing loose.
  await act(async () => {
    render(
      <PluginHost plugins={plugins}>
        <Probe />
        {/* Where `Thread` renders it: inside the reply still being written. */}
        <Slot name="message.pending" />
      </PluginHost>,
    );
  });
  await waitFor(() => {
    expect(host).toBeDefined();
    expect(host?.registry).not.toBe(emptyRegistry);
  });
};

/**
 * Start a reply. It cannot be awaited straight away: the run parks on whatever
 * dialog the gate opens and only finishes once something answers it.
 */
export const reply = (
  endpoint: { baseUrl: string; apiKey: string },
  signal?: AbortSignal,
): { deltas: StreamDelta[]; finished: Promise<void> } => {
  const deltas: StreamDelta[] = [];
  const finished = (async () => {
    for await (const delta of streamChat(
      endpoint,
      "test-model",
      [{ role: "user", content: "go" }],
      {
        extensions: host?.registry.extensions ?? [],
        tools: host?.registry.tools ?? [],
        ...(signal === undefined ? {} : { signal }),
      },
    ))
      deltas.push(delta);
  })();
  return { deltas, finished };
};

export const answer = (deltas: readonly StreamDelta[]) =>
  deltas
    .filter((delta) => delta.kind === "text")
    .map((delta) => delta.text)
    .join("");

/** Present only while a dialog is open, whichever kind it is. */
export const dialogIsOpen = () => screen.queryByTestId("plugin-dialog") !== null;

/** Present only while an approval is waiting inline. */
export const cardIsOpen = () => screen.queryByTestId("approval-card") !== null;
