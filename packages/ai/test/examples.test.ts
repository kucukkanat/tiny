import { afterAll, describe, expect, test } from "bun:test";
import { sseResponse } from "../../../test/helpers.ts";

// Every README snippet is a real file under examples/. These tests run each one
// against a live OpenAI-compatible server and then assert the README embeds it
// verbatim, so a snippet cannot rot into something that no longer executes.

// Every example here is run, so the snippet a reader copies is one that works.
// That it *is* the snippet is asserted centrally by apps/docs/test/examples.test.ts,
// over every `path=` fence in the repo — READMEs included.
const delta = (d: Record<string, string>) => ({ choices: [{ delta: d }] });

const API_KEY = "sk-test";

const server = Bun.serve({
  port: 0,
  fetch(request) {
    const { pathname } = new URL(request.url);
    // A real endpoint rejects a bad key on every route; handle-errors.ts relies
    // on exactly that rather than on a special-cased path.
    if (request.headers.get("authorization") !== `Bearer ${API_KEY}`)
      return Response.json({ error: { message: "Incorrect API key provided" } }, { status: 401 });
    if (pathname === "/v1/chat/completions")
      return sseResponse([
        delta({ reasoning_content: "hmm, " }),
        delta({ content: "Hello" }),
        delta({ content: " world" }),
        {
          choices: [{ delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 },
        },
        "[DONE]",
      ]);
    if (pathname === "/v1/models")
      return Response.json({ data: [{ id: "zeta" }, { id: "alpha" }] });
    return new Response("not found", { status: 404 });
  },
});
afterAll(() => server.stop(true));

const examples = new URL("../examples/", import.meta.url).pathname;
/** Run one example exactly as a reader would, pointed at the local server. */
const run = async (name: string): Promise<string> => {
  const process_ = Bun.spawn(["bun", "run", `${examples}${name}`], {
    cwd: new URL("..", import.meta.url).pathname,
    env: {
      ...process.env,
      AI_BASE_URL: `http://localhost:${server.port}/v1`,
      AI_API_KEY: API_KEY,
      AI_MODEL: "test-model",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process_.stdout).text(),
    new Response(process_.stderr).text(),
    process_.exited,
  ]);
  expect({ name, exitCode, stderr }).toEqual({ name, exitCode: 0, stderr: "" });
  return stdout;
};

describe("examples run", () => {
  test("stream-chat prints reasoning and answer deltas", async () => {
    const out = await run("stream-chat.ts");
    expect(out).toContain("[thinking] hmm,");
    expect(out).toContain("Hello world");
  });

  test("system-prompt replays history and prints the reply", async () => {
    expect(await run("system-prompt.ts")).toContain("Hello world");
  });

  test("cancel-a-stream stops without reporting a failure", async () => {
    expect(await run("cancel-a-stream.ts")).toContain("stopped by the user");
  });

  test("list-models prints the endpoint's ids, sorted", async () => {
    const out = await run("list-models.ts");
    expect(out).toContain("2 models available");
    expect(out.indexOf("alpha")).toBeLessThan(out.indexOf("zeta"));
  });

  test("handle-errors renders the typed failure instead of crashing", async () => {
    const out = await run("handle-errors.ts");
    expect(out).toContain("status: 401");
    expect(out).toContain("401: Incorrect API key provided");
  });

  test("extension-terse streams with the rewritten request", async () => {
    expect(await run("extension-terse.ts")).toContain("Hello world");
  });

  test("extension-hooks reports usage and drops the reasoning delta", async () => {
    const out = await run("extension-hooks.ts");
    expect(out).toContain("[usage]");
    expect(out).toContain("tokens");
    expect(out).toContain("Hello world");
    expect(out).not.toContain("hmm,");
  });

  test("drop-to-pi reaches usage the facade does not surface", async () => {
    expect(await run("drop-to-pi.ts")).toContain("tokens");
  });
});
