import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "@tiny/ai";
import { chatEndpoint } from "../../../test/helpers.ts";
import { historyWindow, systemPrompt } from "../src/index.ts";

// Driven through streamChat against a real OpenAI-compatible server, so these
// run through pi-shaped registration and the actual request path rather than
// through a stand-in host.

const { sentMessages, stream: run } = chatEndpoint();

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
