import { describe, expect, test } from "bun:test";
import { chatEndpoint } from "../../../test/helpers.ts";
import { streamTrace, usageLogger } from "../src/index.ts";

// Driven through streamChat against a real OpenAI-compatible server, so these
// run through pi-shaped registration and the actual request path rather than
// through a stand-in host.

const { stream: run } = chatEndpoint();

const capture = () => {
  const lines: string[] = [];
  return { lines, log: (line: string) => void lines.push(line) };
};

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
