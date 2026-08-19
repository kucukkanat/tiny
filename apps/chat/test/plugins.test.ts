import { afterAll, describe, expect, test } from "bun:test";
import type { ChatMessage, Extension } from "@tiny/ai";
import { streamChat } from "@tiny/ai";
import { loadPlugins } from "@tiny/plugin";
import {
  historyWindow,
  plugins,
  streamTrace,
  systemPrompt,
  usageLogger,
} from "../src/plugins/index.ts";

// The built-ins are driven through streamChat against a real OpenAI-compatible
// server, so they run through pi-shaped registration and the actual request
// path rather than through a stand-in host.

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

const run = async (
  used: readonly Extension[],
  messages: readonly ChatMessage[] = [{ role: "user", content: "hi" }],
): Promise<void> => {
  for await (const _delta of streamChat(endpoint, "test-model", messages, {
    extensions: used,
  }));
};

const capture = () => {
  const lines: string[] = [];
  return { lines, log: (line: string) => void lines.push(line) };
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

describe("usageLogger", () => {
  test("reports the token counts pi puts on the finalized message", async () => {
    const { lines, log } = capture();
    await run([usageLogger(log)]);
    expect(lines).toEqual(["[usage] 10 in + 5 out = 15 tokens"]);
  });

  test("omits cost for an endpoint that publishes no price table", async () => {
    const { lines, log } = capture();
    await run([usageLogger(log)]);
    expect(lines[0]).not.toContain("$");
  });
});

describe("streamTrace", () => {
  test("tallies pi's raw stream events and reports once per reply", async () => {
    const { lines, log } = capture();
    await run([streamTrace(log)]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("text_delta×");
    expect(lines[0]).toContain("thinking_delta×");
    expect(lines[0]).toContain("done×1");
  });

  test("resets its tally between replies", async () => {
    const { lines, log } = capture();
    const trace = streamTrace(log);
    await run([trace]);
    await run([trace]);
    expect(lines[0]).toBe(lines[1]);
  });

  test("subscribes to nothing at all in a production build", async () => {
    const previous = process.env.NODE_ENV;
    const { lines, log } = capture();
    try {
      process.env.NODE_ENV = "production";
      await run([streamTrace(log)]);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
    expect(lines).toEqual([]);
  });
});

describe("registry", () => {
  test("ships observers only, leaving the request byte-identical", async () => {
    await run([]);
    const baseline = sentMessages();
    // The registry holds plugins, so it reaches streamChat the way the app
    // sends it: through the host, which replays the recorded `on()` calls.
    const { extensions } = await loadPlugins(plugins);
    await run(extensions);
    expect(sentMessages()).toEqual(baseline);
  });
});
