import { afterAll, describe, expect, test } from "bun:test";
import type { Extension, StreamDelta } from "../src/index.ts";
import {
  ChatApiError,
  describeError,
  fetchModelIds,
  listModels,
  streamChat,
} from "../src/index.ts";

// A real in-process OpenAI-compatible server — integration, not mocks.
const sse = (payloads: unknown[]): string =>
  payloads.map((p) => `data: ${typeof p === "string" ? p : JSON.stringify(p)}\n\n`).join("");

const delta = (d: Record<string, string>) => ({ choices: [{ delta: d }] });
const stop = { choices: [{ delta: {}, finish_reason: "stop" }] };

let lastChatRequest: { auth: string | null; body: unknown } | undefined;

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/v1/chat/completions") {
      lastChatRequest = { auth: request.headers.get("authorization"), body: await request.json() };
      return new Response(
        sse([
          delta({ reasoning_content: "hmm, " }),
          delta({ reasoning: "let me think" }),
          delta({ content: "Hello" }),
          delta({ content: " world" }),
          stop,
          "[DONE]",
        ]),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }
    // A stream cut short: deltas arrive but the server never reports why it ended.
    if (pathname === "/truncated/chat/completions")
      return new Response(sse([delta({ content: "half a" }), "[DONE]"]), {
        headers: { "Content-Type": "text/event-stream" },
      });
    if (pathname === "/v1/models")
      return Response.json({ data: [{ id: "zeta" }, { id: "alpha" }, { notAnId: 1 }] });
    if (pathname === "/broken/chat/completions" || pathname === "/broken/models")
      return Response.json({ error: { message: "bad key" } }, { status: 401 });
    if (pathname === "/text-error/chat/completions")
      return new Response("plain failure", { status: 500 });
    // A failing response whose body dies mid-read — the connection dropped while
    // the server was still writing its error.
    if (pathname === "/torn-body/models")
      return new Response(
        new ReadableStream({
          async pull(controller) {
            controller.enqueue(new TextEncoder().encode('{"error":'));
            await Bun.sleep(1);
            controller.error(new Error("connection reset"));
          },
        }),
        { status: 500 },
      );
    return new Response("not found", { status: 404 });
  },
});
afterAll(() => server.stop(true));

const endpointFor = (path: string) => ({
  baseUrl: `http://localhost:${server.port}${path}`,
  apiKey: "sk-test",
});

const collect = async (
  path = "/v1/",
  messages: readonly { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "user", content: "hi" },
  ],
  options: { signal?: AbortSignal; extensions?: readonly Extension[] } = {},
): Promise<StreamDelta[]> => {
  const out: StreamDelta[] = [];
  for await (const d of streamChat(endpointFor(path), "gpt-x", messages, options)) out.push(d);
  return out;
};

const bodyOf = (): Record<string, unknown> => {
  const body = lastChatRequest?.body;
  if (typeof body !== "object" || body === null) throw new Error("no request captured");
  return body as Record<string, unknown>;
};

describe("streamChat", () => {
  test("yields reasoning (both field spellings) then text deltas in order", async () => {
    expect(await collect()).toEqual([
      { kind: "reasoning", text: "hmm, " },
      { kind: "reasoning", text: "let me think" },
      { kind: "text", text: "Hello" },
      { kind: "text", text: " world" },
    ]);
  });

  test("sends auth header, model, messages and stream flag; tolerates trailing slash", async () => {
    await collect("/v1/");
    expect(lastChatRequest?.auth).toBe("Bearer sk-test");
    expect(bodyOf()).toMatchObject({
      model: "gpt-x",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });
  });

  test("replays assistant turns and hoists system messages to the system prompt", async () => {
    await collect("/v1", [
      { role: "system", content: "be terse" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "again" },
    ]);
    expect(bodyOf().messages).toEqual([
      { role: "system", content: "be terse" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "again" },
    ]);
  });

  test("throws ChatApiError carrying the server's error message", async () => {
    const run = collect("/broken");
    expect(run).rejects.toBeInstanceOf(ChatApiError);
    await run.catch((error: ChatApiError) => {
      expect(error.message).toContain("401");
      expect(error.message).toContain("bad key");
    });
  });

  test("surfaces non-JSON error bodies", async () => {
    await collect("/text-error").catch((error: ChatApiError) => {
      expect(error.message).toContain("500");
      expect(error.message).toContain("plain failure");
    });
  });

  test("a stream that ends without a finish reason fails loudly", async () => {
    // pi-ai treats a missing finish_reason as a truncated response rather than a
    // silent success, so a dropped connection cannot masquerade as a full reply.
    expect(collect("/truncated")).rejects.toThrow(/finish_reason/);
  });

  test("an aborted signal rejects the stream", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      collect("/v1", [{ role: "user", content: "hi" }], { signal: controller.signal }),
    ).rejects.toThrow();
  });
});

describe("extensions", () => {
  const user = [{ role: "user", content: "hi" }] as const;

  test("before_agent_start replaces the system prompt for the request", async () => {
    await collect("/v1", user, {
      extensions: [
        (tiny) => {
          tiny.on("before_agent_start", () => ({ systemPrompt: "be terse" }));
        },
      ],
    });
    expect(bodyOf().messages).toEqual([
      { role: "system", content: "be terse" },
      { role: "user", content: "hi" },
    ]);
  });

  test("before_agent_start chains, each handler seeing the previous result", async () => {
    const append =
      (word: string): Extension =>
      (tiny) => {
        tiny.on("before_agent_start", (event) => ({
          systemPrompt: `${event.systemPrompt}${word}`,
        }));
      };
    await collect("/v1", user, { extensions: [append("a"), append("b"), append("c")] });
    expect(bodyOf().messages).toContainEqual({ role: "system", content: "abc" });
  });

  test("before_agent_start reports the latest user turn as the prompt", async () => {
    let prompt: string | undefined;
    await collect(
      "/v1",
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "second" },
      ],
      {
        extensions: [
          (tiny) => {
            tiny.on("before_agent_start", (event) => {
              prompt = event.prompt;
            });
          },
        ],
      },
    );
    expect(prompt).toBe("second");
  });

  test("a context handler rewrites the messages that are actually sent", async () => {
    await collect(
      "/v1",
      [
        { role: "user", content: "old" },
        { role: "assistant", content: "older" },
        { role: "user", content: "hi" },
      ],
      {
        extensions: [
          (tiny) => {
            tiny.on("context", (event) => ({ messages: event.messages.slice(-1) }));
          },
        ],
      },
    );
    expect(bodyOf().messages).toEqual([{ role: "user", content: "hi" }]);
  });

  test("a context handler receives a copy it may modify in place", async () => {
    await collect("/v1", user, {
      extensions: [
        (tiny) => {
          // Mutating the copy without returning it must not reach the request.
          tiny.on("context", (event) => {
            event.messages.push({ role: "user", content: "smuggled", timestamp: 0 });
          });
        },
      ],
    });
    expect(bodyOf().messages).toEqual([{ role: "user", content: "hi" }]);
  });

  test("message events fire in order and carry pi's raw stream event", async () => {
    const seen: string[] = [];
    const raw: string[] = [];
    let total: number | undefined;
    await collect("/v1", user, {
      extensions: [
        (tiny) => {
          tiny.on("message_start", () => void seen.push("start"));
          tiny.on("message_update", (event) => {
            seen.push("update");
            raw.push(event.assistantMessageEvent.type);
          });
          tiny.on("message_end", (event) => {
            seen.push("end");
            total = event.message.usage.totalTokens;
          });
        },
      ],
    });
    expect(seen[0]).toBe("start");
    expect(seen.at(-1)).toBe("end");
    expect(raw).toContain("text_delta");
    expect(raw).toContain("thinking_delta");
    expect(total).toBeGreaterThanOrEqual(0);
  });

  test("handlers receive a context carrying the model and signal", async () => {
    const controller = new AbortController();
    let modelId: string | undefined;
    let hasSignal = false;
    await collect("/v1", user, {
      signal: controller.signal,
      extensions: [
        (tiny) => {
          tiny.on("context", (_event, ctx) => {
            modelId = ctx.model.id;
            hasSignal = ctx.signal !== undefined;
          });
        },
      ],
    });
    expect(modelId).toBe("gpt-x");
    expect(hasSignal).toBe(true);
  });

  test("an async factory finishes registering before the request is built", async () => {
    await collect("/v1", user, {
      extensions: [
        async (tiny) => {
          await Bun.sleep(5);
          tiny.on("before_agent_start", () => ({ systemPrompt: "registered late" }));
        },
      ],
    });
    expect(bodyOf().messages).toContainEqual({ role: "system", content: "registered late" });
  });

  test("an async handler is awaited before the request goes out", async () => {
    await collect("/v1", user, {
      extensions: [
        (tiny) => {
          tiny.on("context", async (event) => {
            await Bun.sleep(5);
            return {
              messages: [...event.messages, { role: "user", content: "late", timestamp: 0 }],
            };
          });
        },
      ],
    });
    expect(bodyOf().messages).toContainEqual({ role: "user", content: "late" });
  });

  test("a throwing handler fails the stream rather than being swallowed", async () => {
    expect(
      collect("/v1", user, {
        extensions: [
          (tiny) => {
            tiny.on("context", () => {
              throw new Error("bad extension");
            });
          },
        ],
      }),
    ).rejects.toThrow("bad extension");
  });

  test("a throwing factory fails before any request is sent", async () => {
    expect(
      collect("/v1", user, {
        extensions: [
          () => {
            throw new Error("bad factory");
          },
        ],
      }),
    ).rejects.toThrow("bad factory");
  });

  test("an empty extension list behaves exactly like no extensions", async () => {
    expect(await collect("/v1", user, { extensions: [] })).toEqual(await collect("/v1", user));
  });
});

describe("listModels", () => {
  test("returns sorted model ids, dropping malformed entries", async () => {
    expect(await listModels(endpointFor("/v1"))).toEqual(["alpha", "zeta"]);
  });

  test("throws ChatApiError with the status and message from the endpoint", async () => {
    const run = listModels(endpointFor("/broken"));
    expect(run).rejects.toBeInstanceOf(ChatApiError);
    await run.catch((error: ChatApiError) => {
      expect(error.status).toBe(401);
      expect(error.message).toBe("bad key");
    });
  });

  test("reports a non-JSON failure body verbatim", async () => {
    await listModels(endpointFor("/nowhere")).catch((error: ChatApiError) => {
      expect(error.status).toBe(404);
      expect(error.message).toBe("not found");
    });
  });
});

describe("fetchModelIds", () => {
  test("returns ids in the order the endpoint reported them", async () => {
    expect(await fetchModelIds(endpointFor("/v1"))).toEqual(["zeta", "alpha"]);
  });

  test("still reports a typed error when the failure body is torn mid-read", async () => {
    await fetchModelIds(endpointFor("/torn-body")).catch((error: ChatApiError) => {
      expect(error).toBeInstanceOf(ChatApiError);
      expect(error.status).toBe(500);
      expect(error.message.length).toBeGreaterThan(0);
    });
  });

  test("honours an abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(fetchModelIds(endpointFor("/v1"), controller.signal)).rejects.toThrow();
  });
});

describe("describeError", () => {
  test("prefixes the status when one is known", () => {
    expect(describeError(new ChatApiError("bad key", 401))).toBe("401: bad key");
  });

  test("falls back to the bare message, then to the raw value", () => {
    expect(describeError(new ChatApiError("stream failed"))).toBe("stream failed");
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError("plain string")).toBe("plain string");
  });
});
