/**
 * Shared test scaffolding: the fake OpenAI endpoint and the console capture
 * that every suite used to hand-roll for itself.
 */
import { afterAll, mock } from "bun:test";

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
  return {
    endpoint: { baseUrl: `http://localhost:${server.port}/v1`, apiKey: "sk-test" },
    requests,
    sentMessages: () => requests.at(-1)?.messages ?? [],
  };
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
