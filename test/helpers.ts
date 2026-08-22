/**
 * Shared test scaffolding: the fake OpenAI endpoint and the console capture
 * that every suite used to hand-roll for itself.
 */
import { afterAll, mock } from "bun:test";
// Relative rather than package specifiers: this file lives outside every
// workspace package, so `@tiny/*` does not resolve from here.
import { type ChatMessage, streamChat } from "../packages/ai/src/index.ts";
import { loadPlugins, type Plugin } from "../packages/plugin/src/index.ts";

/** SSE frames in OpenAI's chat-completions framing. */
export const sse = (payloads: unknown[]): string =>
  payloads.map((p) => `data: ${typeof p === "string" ? p : JSON.stringify(p)}\n\n`).join("");

export const sseResponse = (payloads: unknown[]): Response =>
  new Response(sse(payloads), { headers: { "Content-Type": "text/event-stream" } });

/** The reply suites use when the content does not matter: a thought, a greeting, usage. */
export const usageReply = [
  { choices: [{ delta: { reasoning_content: "hmm" } }] },
  { choices: [{ delta: { content: "Hi" } }] },
  {
    choices: [{ delta: {}, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  },
];

export type ChatRequest = { messages?: { role: string; content: string }[] } & Record<
  string,
  unknown
>;

/**
 * A real in-process OpenAI-compatible endpoint — integration, not mocks. It
 * answers every request with the given stream, records each request body, and
 * stops itself when the suite ends.
 */
export const chatEndpoint = (payloads: readonly unknown[] = usageReply) => {
  const requests: ChatRequest[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      requests.push((await request.json()) as ChatRequest);
      return sseResponse([...payloads, "[DONE]"]);
    },
  });
  afterAll(() => server.stop(true));
  const endpoint = { baseUrl: `http://localhost:${server.port}/v1`, apiKey: "sk-test" };
  return {
    endpoint,
    requests,
    sentMessages: () => requests.at(-1)?.messages ?? [],
    /** Loads the plugins the way the app does, then streams a real request through them. */
    stream: async (
      plugins: readonly Plugin[],
      messages: readonly ChatMessage[] = [{ role: "user", content: "hi" }],
    ): Promise<void> => {
      const { extensions } = await loadPlugins(plugins);
      for await (const _delta of streamChat(endpoint, "test-model", messages, { extensions }));
    },
  };
};

/** Runs one example file as a subprocess, returning what it printed and how it exited. */
export const runExample = async (
  url: URL,
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
) => {
  const proc = Bun.spawn(["bun", "run", url.pathname], {
    stdout: "pipe",
    stderr: "pipe",
    ...options,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
};

/**
 * Runs `body` with `console.error` captured, returning what it reported.
 *
 * The registry drops a clashing or malformed registration rather than throwing,
 * so this line is the whole of the feedback a plugin author gets — which makes
 * it part of the contract rather than noise, and worth asserting.
 */
export const reported = async (body: () => unknown): Promise<string[]> => {
  const lines: string[] = [];
  const original = console.error;
  console.error = mock((...args: unknown[]) => void lines.push(args.join(" ")));
  try {
    await body();
  } finally {
    console.error = original;
  }
  return lines;
};
