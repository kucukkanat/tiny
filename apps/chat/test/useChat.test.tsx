import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useChat } from "../src/hooks/useChat.ts";
import { getConversation } from "../src/storage/conversations.ts";

// bun:test hooks aren't globals, so testing-library can't auto-register this.
afterEach(cleanup);

const sse = (payloads: unknown[]): string =>
  payloads.map((p) => `data: ${typeof p === "string" ? p : JSON.stringify(p)}\n\n`).join("");

let lastBody: { messages?: { role: string; content: string }[] } | undefined;

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/v1/chat/completions") {
      lastBody = await request.json();
      return new Response(
        sse([
          { choices: [{ delta: { reasoning_content: "pondering" } }] },
          { choices: [{ delta: { content: "Hi " } }] },
          { choices: [{ delta: { content: "there" } }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
          "[DONE]",
        ]),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }
    if (pathname === "/broken/chat/completions")
      return Response.json({ error: { message: "nope" } }, { status: 401 });
    return new Response("not found", { status: 404 });
  },
});
afterAll(() => server.stop(true));

/** `useChat` takes the endpoint and the model separately, so a conversation can
 *  run through a plugin-registered provider rather than the saved settings. */
const against = (path: string) => ({
  conversationId: undefined,
  endpoint: { baseUrl: `http://localhost:${server.port}${path}`, apiKey: "sk-test" },
  model: "test-model",
  onConversationCreated: () => {},
});

describe("useChat", () => {
  test("streams a reply, persists the conversation, and reports the new id", async () => {
    let createdId: string | undefined;
    const { result } = renderHook(() =>
      useChat({
        ...against("/v1"),
        onConversationCreated: (id) => {
          createdId = id;
        },
      }),
    );

    await act(() => result.current.send("hello"));

    expect(createdId).toBeDefined();
    expect(result.current.messages).toEqual([
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "Hi there",
        reasoning: "pondering",
        reasoningSeconds: expect.any(Number),
      },
    ]);
    expect(result.current.error).toBeUndefined();

    const stored = createdId === undefined ? undefined : await getConversation(createdId);
    expect(stored?.title).toBe("hello");
    expect(stored?.messages).toHaveLength(2);
  });

  test("loads an existing conversation by id", async () => {
    let createdId: string | undefined;
    const first = renderHook(() =>
      useChat({
        ...against("/v1"),
        onConversationCreated: (id) => {
          createdId = id;
        },
      }),
    );
    await act(() => first.result.current.send("hello again"));
    first.unmount();

    const second = renderHook(() => useChat({ ...against("/v1"), conversationId: createdId }));
    await waitFor(() => expect(second.result.current.messages).toHaveLength(2));
  });

  test("surfaces API errors but keeps the user message", async () => {
    const { result } = renderHook(() => useChat(against("/broken")));
    await act(() => result.current.send("hi"));
    expect(result.current.error).toContain("401");
    expect(result.current.error).toContain("nope");
    expect(result.current.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  test("runs the extensions it is given against the real request", async () => {
    let tokens: number | undefined;
    const { result } = renderHook(() =>
      useChat({
        ...against("/v1"),
        extensions: [
          (pi) => {
            pi.on("before_agent_start", () => ({ systemPrompt: "be terse" }));
            pi.on("message_end", (event) => {
              tokens = event.message.usage.totalTokens;
            });
          },
        ],
      }),
    );

    await act(() => result.current.send("hello"));

    expect(lastBody?.messages?.[0]).toEqual({ role: "system", content: "be terse" });
    // The reply still streams normally, and message_end reported its usage.
    expect(result.current.messages[1]).toMatchObject({ role: "assistant", content: "Hi there" });
    expect(tokens).toBeGreaterThanOrEqual(0);
  });

  test("does nothing without a resolved endpoint", async () => {
    const { result } = renderHook(() =>
      useChat({
        conversationId: undefined,
        endpoint: undefined,
        model: "",
        onConversationCreated: () => {},
      }),
    );
    await act(() => result.current.send("hi"));
    expect(result.current.messages).toEqual([]);
  });
});
