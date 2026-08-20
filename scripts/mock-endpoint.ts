/**
 * A local OpenAI-compatible endpoint that always calls a tool.
 *
 * Testing an approval flow needs a model that reliably reaches for a tool, which
 * a real one does not: it may answer in prose, pick a different tool, or decide
 * the request is unsafe. This one is deterministic — it calls a tool on the first
 * turn, then answers once the result comes back — so what you are exercising in
 * the UI is the gate, not the model's mood.
 *
 *     bun run scripts/mock-endpoint.ts
 *
 * Then point Settings at http://localhost:8787/v1 with any key.
 */

const PORT = Number(process.env.PORT ?? 8787);

/** The page runs on a different origin, so every answer needs these. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Body = {
  messages?: readonly { role?: string; content?: unknown }[];
  tools?: readonly { function?: { name?: string; parameters?: JsonSchema } }[];
};

type JsonSchema = {
  properties?: Record<string, { type?: string }>;
  required?: readonly string[];
};

const sse = (payloads: readonly unknown[]): string =>
  [...payloads, "[DONE]"]
    .map((p) => `data: ${typeof p === "string" ? p : JSON.stringify(p)}\n\n`)
    .join("");

const stream = (payloads: readonly unknown[]) =>
  new Response(sse(payloads), {
    headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });

const text = (content: string) => ({ choices: [{ delta: { content } }] });
const finish = (reason: string) => ({ choices: [{ delta: {}, finish_reason: reason }] });

const callTool = (name: string, args: Record<string, unknown>) => ({
  choices: [
    {
      delta: {
        tool_calls: [
          {
            index: 0,
            id: `call_${name}`,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      },
    },
  ],
});

/** The newest thing the user actually typed, used as the tool's payload. */
const lastUserText = (body: Body): string => {
  const message = body.messages?.findLast((entry) => entry.role === "user");
  return typeof message?.content === "string" ? message.content : "hello from the mock endpoint";
};

/**
 * Plausible arguments for whichever tool is registered, so this works against a
 * registry it has never seen. Strings named like a path get one; everything else
 * gets the user's text.
 */
const argumentsFor = (schema: JsonSchema | undefined, prompt: string): Record<string, unknown> => {
  const properties = schema?.properties ?? {};
  const names = schema?.required ?? Object.keys(properties);
  return Object.fromEntries(
    names.map((name) => [
      name,
      /path|file|dir/i.test(name) ? "/notes/hello.md" : /count|limit|n$/i.test(name) ? 1 : prompt,
    ]),
  );
};

/** Prefer a tool that writes — the interesting one to be asked about. */
const pickTool = (body: Body) => {
  const tools = body.tools ?? [];
  const preferred = ["fs_write", "fs_edit", "write", "edit"];
  return (
    tools.find((tool) => preferred.includes(tool.function?.name ?? "")) ??
    tools.find((tool) => (tool.function?.name ?? "").startsWith("fs_")) ??
    tools[0]
  );
};

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (pathname.endsWith("/models"))
      return Response.json({ data: [{ id: "mock-tool-caller" }] }, { headers: CORS });

    if (!pathname.endsWith("/chat/completions"))
      return new Response("not found", { status: 404, headers: CORS });

    const body = (await request.json()) as Body;
    const answered = body.messages?.some((entry) => entry.role === "tool") === true;
    const tool = pickTool(body);

    // Second turn, or nothing to call: answer in prose and end the exchange.
    if (answered || tool?.function?.name === undefined) {
      const reason = answered
        ? "Right — here is what came back from the tool."
        : "No tools are registered, so there is nothing to approve.";
      return stream([text(reason), finish("stop")]);
    }

    console.log(`→ calling ${tool.function.name}`);
    return stream([
      text("Sure — one moment.\n\n"),
      callTool(tool.function.name, argumentsFor(tool.function.parameters, lastUserText(body))),
      finish("tool_calls"),
    ]);
  },
});

console.log(`mock endpoint on http://localhost:${server.port}/v1 — any key works`);
