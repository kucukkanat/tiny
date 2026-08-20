import { afterAll, describe, expect, test } from "bun:test";
import type { ChatMessage } from "@tiny/ai";
import { streamChat } from "@tiny/ai";
import type { IdentifiedPlugin } from "@tiny/plugin";
import { loadPlugins } from "@tiny/plugin";
import { historyWindow, systemPrompt } from "../src/index.ts";

// Driven through streamChat against a real OpenAI-compatible server, so these
// run through pi-shaped registration and the actual request path rather than
// through a stand-in host.

const sse = (payloads: unknown[]): string =>
  payloads.map((p) => `data: ${typeof p === "string" ? p : JSON.stringify(p)}\n\n`).join("");

let lastBody: { messages?: { role: string; content: string }[] } | undefined;

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    lastBody = await request.json();
    return new Response(
      sse([
        { choices: [{ delta: { reasoning_content: "hmm" } }] },
        { choices: [{ delta: { content: "Hi" } }] },
        {
          choices: [{ delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
        "[DONE]",
      ]),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  },
});
afterAll(() => server.stop(true));

const endpoint = { baseUrl: `http://localhost:${server.port}/v1`, apiKey: "sk-test" };

/** Loads the plugins the way the app does, then streams a real request through them. */
const run = async (
  used: readonly IdentifiedPlugin[],
  messages: readonly ChatMessage[] = [{ role: "user", content: "hi" }],
): Promise<void> => {
  const { extensions } = await loadPlugins(used);
  for await (const _delta of streamChat(endpoint, "test-model", messages, { extensions }));
};

const sentMessages = () => lastBody?.messages ?? [];

const turns = (count: number): ChatMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `turn ${index}`,
  }));

describe("systemPrompt", () => {
  test("sets the prompt when the conversation carries none", async () => {
    await run([systemPrompt("be terse")]);
    expect(sentMessages()[0]).toEqual({ role: "system", content: "be terse" });
  });

  test("defers to a prompt the conversation already carries", async () => {
    await run(
      [systemPrompt("be terse")],
      [
        { role: "system", content: "be verbose" },
        { role: "user", content: "hi" },
      ],
    );
    expect(sentMessages()[0]).toEqual({ role: "system", content: "be verbose" });
  });
});

describe("historyWindow", () => {
  test("replays only the last n turns", async () => {
    await run([historyWindow(3)], turns(10));
    expect(sentMessages()).toEqual([
      { role: "assistant", content: "turn 7" },
      { role: "user", content: "turn 8" },
      { role: "assistant", content: "turn 9" },
    ]);
  });

  test("leaves history shorter than the window untouched", async () => {
    await run([historyWindow(50)], turns(4));
    expect(sentMessages()).toHaveLength(4);
  });

  test("keeps the system prompt, which is not one of the turns", async () => {
    await run(
      [historyWindow(1)],
      [
        { role: "system", content: "be terse" },
        { role: "user", content: "old" },
        { role: "user", content: "newest" },
      ],
    );
    expect(sentMessages()).toEqual([
      { role: "system", content: "be terse" },
      { role: "user", content: "newest" },
    ]);
  });
});
