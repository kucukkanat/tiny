# @tiny/ai

A tiny, fully-typed streaming client for any **OpenAI-compatible** chat endpoint
(OpenAI, OpenRouter, Groq, Ollama, LM Studio, vLLM, …).

The transport is [`@earendil-works/pi-ai`](https://github.com/earendil-works/pi) — the
LLM layer of the [pi](https://pi.dev) runtime. This package is the thin, browser-first
facade over it: it calls pi's OpenAI-compatible API implementation directly, and
streams come back as plain text and reasoning deltas.

## Running the examples

Every code block below is a complete program that lives in
[`examples/`](examples) — nothing is elided. Each reads the same three
environment variables, so point them at any endpoint and run one:

```sh
export AI_BASE_URL=http://localhost:11434/v1   # Ollama; or https://api.openai.com/v1
export AI_API_KEY=sk-...
export AI_MODEL=llama3.2

bun run examples/stream-chat.ts
```

The test suite runs all of them against an in-process server, so they are known
to execute rather than merely to look right.

## Usage

Stream a chat completion — `examples/stream-chat.ts`:

```ts path=packages/ai/examples/stream-chat.ts
import { streamChat } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};
const model = process.env.AI_MODEL ?? "gpt-4.1-mini";

for await (const delta of streamChat(endpoint, model, [
  { role: "user", content: "Why is the sky blue?" },
])) {
  if (delta.kind === "reasoning") process.stdout.write(`[thinking] ${delta.text}`);
  else if (delta.kind === "text") process.stdout.write(delta.text);
}

process.stdout.write("\n");
```

Reasoning models that expose their thinking (`reasoning_content` in the DeepSeek
style, or `reasoning` / `reasoning_text`) yield `{ kind: "reasoning" }` deltas before
the answer.

Messages with `role: "system"` are hoisted into the request's system prompt, so
ordinary chat history works unchanged — `examples/system-prompt.ts`:

```ts path=packages/ai/examples/system-prompt.ts
import { streamChat } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};
const model = process.env.AI_MODEL ?? "gpt-4.1-mini";

// `system` turns are hoisted into the request's system prompt, so ordinary chat
// history — including earlier assistant replies — can be replayed as-is.
const answer = streamChat(endpoint, model, [
  { role: "system", content: "Answer in one sentence." },
  { role: "user", content: "What is TypeScript?" },
  { role: "assistant", content: "A typed superset of JavaScript." },
  { role: "user", content: "And who maintains it?" },
]);

let reply = "";
for await (const delta of answer) if (delta.kind === "text") reply += delta.text;

console.log(reply);
```

Cancel a stream with a standard `AbortSignal` — `examples/cancel-a-stream.ts`:

```ts path=packages/ai/examples/cancel-a-stream.ts
import { streamChat } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};
const model = process.env.AI_MODEL ?? "gpt-4.1-mini";

const controller = new AbortController();

try {
  for await (const delta of streamChat(
    endpoint,
    model,
    [{ role: "user", content: "Count slowly to a hundred." }],
    { signal: controller.signal },
  )) {
    if (delta.kind !== "tool") process.stdout.write(delta.text);
    // A UI would abort on a click; this stops after the first delta lands.
    controller.abort();
  }
} catch (error) {
  // An aborted stream rejects, so the stop has to be told apart from a failure.
  if (!controller.signal.aborted) throw error;
  console.log("\nstopped by the user");
}
```

List models — `examples/list-models.ts`:

```ts path=packages/ai/examples/list-models.ts
import { listModels } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};

const ids = await listModels(endpoint); // sorted alphabetically

console.log(`${ids.length} models available:`);
for (const id of ids) console.log(`  ${id}`);
```

## Errors

Every failure throws `ChatApiError`. `status` is set when the failure came from a
response this package reads itself (model listing); for streaming failures pi-ai has
already folded the status into the message, so `status` is `undefined` there. Use
`describeError` to render either case — `examples/handle-errors.ts`:

```ts path=packages/ai/examples/handle-errors.ts
import { ChatApiError, describeError, listModels } from "@tiny/ai";

const baseUrl = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";

// A deliberately wrong key, so the endpoint answers 401 and there is something
// to render.
const endpoint = { baseUrl, apiKey: "not-a-real-key" };

try {
  await listModels(endpoint);
  console.log("the key worked after all");
} catch (error) {
  // `status` is set here because this package read the response itself; for a
  // failed stream pi has already folded the status into the message.
  if (error instanceof ChatApiError) console.log("status:", error.status);
  console.log(describeError(error)); // "401: Incorrect API key provided ..."
}
```

A stream whose server never reports a `finish_reason` is treated as **truncated** and
throws, rather than being reported as a complete answer — a dropped connection cannot
masquerade as a finished reply.

## Extensions

Extensions follow the shape of pi's own extension SDK
([`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi), see its
`docs/extensions.md`): a factory that receives an `ExtensionAPI` and subscribes to
named lifecycle events, whose handlers return a patch object or nothing. If you have
written a pi extension, you already know this API. `examples/extension-terse.ts`:

```ts path=packages/ai/examples/extension-terse.ts
import type { ExtensionAPI } from "@tiny/ai";
import { streamChat } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};
const model = process.env.AI_MODEL ?? "gpt-4.1-mini";

// An extension is a factory that receives the extension API and subscribes to
// events — the same shape pi's own extensions use, so this would be the default
// export of a file under `.pi/extensions/`.
const beTerse = (pi: ExtensionAPI) => {
  pi.on("before_agent_start", () => ({ systemPrompt: "Answer in one sentence." }));
};

for await (const delta of streamChat(
  endpoint,
  model,
  [{ role: "user", content: "Why is the sky blue?" }],
  { extensions: [beTerse] },
)) {
  if (delta.kind === "text") process.stdout.write(delta.text);
}

process.stdout.write("\n");
```

### Events

A browser chat facade has no agent loop, tools or session, so only the subset of pi's
events that this package can genuinely fire is implemented. Names, payload fields and
result shapes match pi's.

| Event | Payload | Handler may return |
| --- | --- | --- |
| `before_agent_start` | `prompt`, `systemPrompt` | `{ systemPrompt }` — replaces it; **chained** across extensions |
| `context` | `messages` (a copy, safe to modify) | `{ messages }` — replaces the replayed history |
| `message_start` | `message` | — |
| `message_update` | `message`, `assistantMessageEvent` | — |
| `message_end` | `message` (carries `usage` and `cost`) | — |
| `tool_call` | `toolCallId`, `toolName`, `input` (**mutable**) | `{ block, reason }` — stops the call |

`tool_call` fires between preparing a tool's arguments and running it, which is
where a permission gate belongs: the arguments are final and nothing has happened
yet. pi's contract is kept exactly —

- **`event.input` is mutable.** Patch the model's arguments in place; later
  handlers see the patch, and nothing is re-validated afterwards. The return
  value only ever blocks.
- **The first handler to block wins** and the rest are skipped.
- **A block is an error result, not a failed request.** `reason` (or pi's
  `"Tool execution was blocked"`) is fed back as the tool's output, so the model
  reads it and can try something else instead of the turn dying.
- **The signal is re-checked after the handlers.** A gate that asks the user is
  the natural place for them to give up, and giving up fails the stream rather
  than reporting a refusal nobody made.

```ts
pi.on("tool_call", (event) =>
  String(event.input.path).includes("/.env")
    ? { block: true, reason: "That path is off limits." }
    : undefined,
);
```

`assistantMessageEvent` is pi-ai's raw token-level event (`text_delta`,
`thinking_delta`, `toolcall_*`, …), so an extension can observe everything the
provider streams, not just what this facade turns into deltas.

All of it together, in `examples/extension-hooks.ts`:

```ts path=packages/ai/examples/extension-hooks.ts
import type { ExtensionAPI } from "@tiny/ai";
import { streamChat } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};
const model = process.env.AI_MODEL ?? "gpt-4.1-mini";

/** One extension can subscribe to as many events as it needs. */
const observant = (pi: ExtensionAPI) => {
  // Replace the system prompt for this request. pi chains this event, so
  // `event.systemPrompt` already carries what earlier extensions returned.
  pi.on("before_agent_start", (event) => ({
    systemPrompt: `${event.systemPrompt} Answer in one sentence.`.trim(),
  }));

  // Modify the replayed history. `event.messages` is a copy, safe to modify.
  pi.on("context", (event) => ({ messages: event.messages.slice(-20) }));

  // Watch the reply assemble, token by token.
  pi.on("message_update", (event) => {
    if (event.assistantMessageEvent.type === "thinking_delta") process.stdout.write("·");
  });

  // The finalized message carries usage and cost.
  pi.on("message_end", (event) => {
    const { input, output, totalTokens } = event.message.usage;
    console.log(`\n[usage] ${input} in + ${output} out = ${totalTokens} tokens`);
  });
};

/** Handlers may be async; pi awaits them before continuing. */
const slowAudit = (pi: ExtensionAPI) => {
  pi.on("context", async (event) => {
    await Promise.resolve();
    console.log(`[audit] sending ${event.messages.length} message(s)`);
  });
};

for await (const delta of streamChat(
  endpoint,
  model,
  [{ role: "user", content: "Why is the sky blue?" }],
  { extensions: [observant, slowAudit] },
)) {
  if (delta.kind === "text") process.stdout.write(delta.text);
}
```

Rules worth knowing:

- Factories run **in array order**, and handlers fire in registration order. A
  factory may be `async`; it is awaited before the request is built, so one-time
  setup finishes first — as pi awaits factories before `session_start`.
- Handlers may be sync or async, and returning nothing means "no change".
- `before_agent_start` **chains**: each handler sees the previous handler's
  system prompt rather than the original.
- `context.messages` is a copy. Mutating it in place changes nothing — return
  `{ messages }` to be applied, exactly as in pi.
- Nothing is caught. A throwing factory fails before any request goes out; a
  throwing handler fails the stream, surfacing through the same `try`/`catch` as
  `ChatApiError`.
- Cost is `0` for a bring-your-own endpoint — `endpointModel()` has no price
  table — but the token counts on `message_end` are real.

### How this differs from pi

Honest accounting, so nothing here is mistaken for full SDK conformance:

| pi has | Here |
| --- | --- |
| `registerTool`, `registerCommand`, `registerShortcut`, `registerFlag`, `registerProvider` | Not implemented — there is no agent loop, tool executor or command palette to register into |
| `ctx.ui` (confirm, select, notify, custom TUI), `ctx.sessionManager`, `ctx.cwd`, `ctx.modelRegistry` | `ctx` carries `model` and `signal` only |
| Session, turn, agent and input events, and the `tool_execution_*` / `tool_result` pair | Not fired. `tool_call` is the one tool event here, because it is the one this package's own loop can honour |
| `message_end` can return `{ message }` to replace the finalized message | Observation only; the facade streams deltas and never hands back a message |
| `AgentMessage` (pi-agent-core) in event payloads | pi-ai's `Message` / `AssistantMessage`, which this package already re-exports |
| Extensions auto-discovered from `~/.pi/agent/extensions/` and loaded via jiti | Passed explicitly as `options.extensions` |
| A failed request surfaces through the agent's error handling | No event; `streamChat` throws `ChatApiError` |

Adopting the real `ExtensionAPI` wholesale is not possible here: `pi-coding-agent`
is a Node CLI (`bin: pi`, `engines.node >= 22.19`, depending on `pi-tui`, `jiti`,
`cross-spawn`), which a browser PWA cannot load and which would need a server this
app deliberately does not have.

### Adding one to the chat app

The app owns its extensions; this package only runs them. Write the extension in
`apps/chat/src/plugins/`, then list it in that folder's registry,
[`apps/chat/src/plugins/index.ts`](../../apps/chat/src/plugins/index.ts):

```ts
import { beTerse } from "./beTerse.ts";

export const plugins: readonly IdentifiedPlugin[] = [
  // …the plugins already there…
  beTerse(),
];
```

The list is typed `Plugin` — `@tiny/plugin`'s richer type — because the app runs
a plugin host. **An extension that only subscribes to events already *is* a
`Plugin`**, so a factory written against `ExtensionAPI` drops straight in with no
adapter. That containment is the whole relationship between the two packages.

The built-ins take their configuration as arguments and return an `Extension`, so
the registry reads as a list of configured extensions. Uncommenting a line is the
whole wiring — `useChat` already passes the registry to `streamChat`, so neither
`@tiny/ai` nor any component changes. `usageLogger` and `streamTrace` are observers
and ship enabled; `systemPrompt(text)` and `historyWindow(turns)` rewrite the
request, so they are left opt-in.

For one-off behaviour, `useChat` takes the list as an optional fourth argument,
so a screen or a test can pass its own without touching the registry.

## Dropping down to pi

When a hook is not enough — you want the raw stream rather than a view of it —
`endpointModel()` builds the pi-ai model descriptor for an id on your endpoint, so
anything this facade does not expose — tool calls, token usage, cost — is one call
away through pi's own API module. `examples/drop-to-pi.ts`:

```ts path=packages/ai/examples/drop-to-pi.ts
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { endpointModel } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};

// `endpointModel` builds the pi descriptor, so pi's own API module can be
// called directly when a hook is not enough and you want the raw stream.
const model = endpointModel(endpoint, process.env.AI_MODEL ?? "gpt-4.1-mini");

const stream = openAICompletionsApi().stream(
  model,
  { messages: [{ role: "user", content: "Hello!", timestamp: Date.now() }] },
  { apiKey: endpoint.apiKey },
);

for await (const event of stream) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
}

// The assembled message carries everything this facade does not surface.
const message = await stream.result();
console.log(`\n${message.usage.totalTokens} tokens, $${message.usage.cost.total}`);
```

`Model`, `Context`, `Message`, `AssistantMessage`, `AssistantMessageEvent` and `Usage`
are re-exported from this package, so consumers need no direct pi-ai dependency —
including when typing an extension's hooks.

## API types

`Endpoint.api` picks pi's streaming implementation; it defaults to
`openai-completions`, so an endpoint that omits it behaves exactly as before.

| Supported | Left out, and why |
| --- | --- |
| `openai-completions`, `openai-responses`, `azure-openai-responses`, `anthropic-messages`, `mistral-conversations`, `google-generative-ai` | `openai-codex-responses` imports `node:zlib`; `google-vertex` signs a service-account JWT through `GoogleAuth`; `bedrock-converse-stream` transports over `@smithy/node-http-handler` |

Each implementation sits behind its own dynamic import in `apis.ts`, so a build
with code splitting downloads only the one an endpoint actually uses — nothing
vendor-specific is in the initial payload.

`listModels` speaks each family's own dialect: a bearer token for the OpenAI
family and Mistral, `x-api-key` plus `anthropic-version` for Anthropic, and a
query-string key for Google, whose `models/<id>` names are unqualified to the
bare id.

## Browser notes

pi-ai runs in the browser, but **import paths matter**:

- This package deliberately imports only `@earendil-works/pi-ai/api/*`, never the
  package root. The root re-exports `Type` from `typebox`, whose module directory
  named `arguments` makes Bun's dev server emit `var [arguments, …] = hmr.imports` —
  an illegal binding in strict mode that blanks the page with
  `SyntaxError: Invalid destructuring assignment target`. Type-only imports from the
  root are fine; they are erased before bundling.
- The provider SDK sits behind pi's `.lazy` wrapper and loads on the first request.
  Build with code splitting (`splitting: true` in `Bun.build`) to keep it out of the
  initial payload.

Keys are passed explicitly — there is no environment or credential store to fall back
on in a browser. As always, a key shipped to a browser is visible to whoever holds it.

## Test

```sh
bun test
```

Tests run against a real in-process `Bun.serve` OpenAI-compatible server — no mocks.
That includes every example above: each is executed as a subprocess and its output
checked, and the README is asserted to embed each file verbatim.
