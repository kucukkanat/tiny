# Tools for the model

`registerTool` adds a tool the model may call mid-answer. `@tiny/ai` sends the
definitions with the request, executes each call, feeds the result back, and
repeats until the model answers — so a plugin only has to say what the tool does
and how to run it.

```ts
import { toolOutput } from "@tiny/ai";

tiny.registerTool({
  name: "fs_read",
  label: "Read File",
  description: "Read a text file and return its full contents.",
  parameters: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  },
  execute: async (_id, params, signal) => toolOutput(await readFile(String(params.path), signal)),
});
```

## The definition

```ts
type ToolDefinition = {
  readonly name: string;
  readonly label?: string;
  readonly description: string;
  readonly promptSnippet?: string;
  readonly promptGuidelines?: readonly string[];
  readonly parameters: Record<string, unknown>;
  prepareArguments?(args: Record<string, unknown>): Record<string, unknown>;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: ((update: ToolUpdate) => void) | undefined,
    ctx: ToolExecuteContext,
  ): Promise<ToolResult> | ToolResult;
};
```

**`execute` is pi's signature exactly**, positional arguments and all, so a tool
written for pi runs here without being rewritten. Note the order: the call id
comes first and the model's arguments second.

One deliberate difference remains: **`parameters` is a plain JSON Schema object
rather than a typebox `TSchema`.** A typebox schema *is* a JSON Schema object at
runtime, so definitions port across unchanged — and typebox stays out of the
browser bundle, which `@tiny/ai`'s "Browser notes" explains is not optional here.

`description` is the prompt. It is the only thing the model reads before deciding
to call your tool, so write it for a reader who cannot see your code: say what it
returns, and say when to reach for it.

> "List the entries of a directory. Returns one line per entry, marking
> directories with a trailing slash. **Use this before reading when unsure what
> exists.**"

## The result

```ts
type ToolResult = {
  readonly content: readonly { type: "text"; text: string }[];  // sent to the model
  readonly details?: unknown;                                   // not sent; for rendering and state
  readonly terminate?: boolean;                                 // end the turn after this batch
};
```

Two helpers save the ceremony:

```ts
import { toolOutput, toolText } from "@tiny/ai";

toolOutput("Wrote 12 characters", { details: { path: "/a.txt" } });
toolText(result); // the text blocks, joined — what the model reads
```

`terminate` is honoured the way pi honours it: the turn ends only when **every**
finalized result in the batch asks for it. One tool cannot end the turn on the
others' behalf.

## Prompt fields

`promptSnippet` and `promptGuidelines` are folded into the system prompt before
`before_agent_start` fires, so an extension that rewrites the prompt sees what the
model will actually get.

```ts
tiny.registerTool({
  name: "todo",
  description: "Manage a todo list",
  promptSnippet: "List or add items in the project todo list",
  promptGuidelines: ["Prefer todo over direct file edits when asked for a task list."],
  // …
});
```

`label` is a display name — the tool row in the thread shows it instead of the raw
tool name.

## Progress while it runs

`onUpdate` pushes an interim result. It arrives as an updated summary on the
tool's row, so a long call is not a frozen `…`:

```ts
execute: async (_id, params, signal, onUpdate) => {
  onUpdate?.({ content: [{ type: "text", text: "Fetching page 1…" }] });
  const all = await crawl(String(params.url), signal);
  return toolOutput(all);
},
```

## Repairing arguments

`prepareArguments` is pi's last chance to fix what a model got subtly wrong,
before `execute` sees it:

```ts
prepareArguments(args) {
  // An older prompt taught the model the previous field name.
  if (typeof args.oldAction === "string" && args.action === undefined)
    return { ...args, action: args.oldAction };
  return args;
},
```

Throwing here is a tool error like any other.


## Arguments are untrusted

`params` is whatever the model produced. It matched your schema on a good day and
did not on a bad one, so check every field before use:

```ts
const text = (params: Record<string, unknown>, key: string): string => {
  const value = params[key];
  if (typeof value !== "string") throw new FsError(`"${key}" must be a string`);
  return value;
};
```

## Throwing is normal control flow

`execute` resolves to a `ToolResult`. Throwing instead marks the result as an
error and hands your message back to the model, which reads it and can correct
itself — the turn does not fail.

That makes a good error message part of the tool's interface:

```ts
throw new FsError(`"path" must be a string`);     // the model will retry with a string
throw new FsError(`${display(parts)} is empty`);  // …or stop asking
```

Honour the `signal` argument for anything slow. It is the signal of the request
in flight, so passing it to `fetch` means your work is cancelled when the user
stops the reply.

## Names must be unique

Unlike a [command](anatomy.md#commands), a tool name cannot be suffixed — the
model addresses it by name, so `fs_read:2` would be meaningless. The first
registration wins, and the clash is reported rather than silently shadowing:

```
[plugin:my-plugin] tool "fs_read" is already registered
```

Prefix your tool names with something that belongs to your plugin (`fs_`,
`notion_`) and this never comes up.

## A worked example

[`@tiny/plugin-fs`](https://github.com/kucukkanat/tiny/tree/main/packages/plugin-fs)
gives the model five filesystem tools — `fs_read`, `fs_write`, `fs_edit`,
`fs_delete`, `fs_list` — over the browser's Origin Private File System. Adding it
to the registry is the whole wiring:

```ts path=packages/plugin-fs/examples/register.ts
import { loadPlugins } from "@tiny/plugin";
import { fileSystem } from "@tiny/plugin-fs";

// Adding the plugin to the registry is the whole wiring: `loadPlugins` collects
// its tools, and `useChat` hands them to `streamChat` for the model to call.
const { tools } = await loadPlugins([fileSystem()]);

for (const tool of tools) console.log(`${tool.name} — ${tool.description.split(".")[0]}`);
```

It is also the sharpest illustration of why [runtime plugin
sources are hash-pinned](runtime.md#the-manifest-is-the-trust-boundary): those
tools write into the same OPFS that installed plugin sources live in, so the model
can create a file under `/plugins`. It will never run.

## Approvals are just an event

A tool that writes files, spends money or talks to someone else should ask first.
Nothing in the tool has to change for that, and no wrapper sits in front of it:
`@tiny/ai` fires pi's **`tool_call`** event between preparing the arguments and
running them, and any plugin can answer.

```ts
tiny.on("tool_call", async (event, ctx) => {
  if (event.toolName !== "fs_delete") return undefined;
  const ok = await ctx.ui.confirm("Delete?", String(event.input.path));
  return ok ? undefined : { block: true, reason: "The user said no." };
});
```

Three properties are worth understanding before you write one:

- **Blocking does not end the turn.** The `reason` is fed back as the tool's
  result, so the model reads it and can do something else — ask for a different
  path, or explain itself. A gate steers; it does not just refuse.
- **`event.input` is mutable.** Patch the model's arguments in place and the
  patched values are what runs. The returned object only blocks; it never carries
  arguments. That is pi's contract, kept verbatim.
- **The first handler to block wins.** Later ones are skipped, and a handler that
  throws blocks too — a gate that crashes must fail closed.

Handlers get the same `ctx` a [command](context.md) does, `ctx.ui` included, plus
the request's `model` and `signal`. That is what makes the dialog above possible,
and it is why pi's own permission gates run here with no required edit but their
import.

[`@tiny/plugin-hitl`](https://github.com/kucukkanat/tiny/tree/main/packages/plugin-hitl)
is this event with a policy and an approval card in front of it. The card renders
**inside the reply**, through the [`message.pending`](slots.md) slot, rather than
as a modal over the app: the question is about one tool call, so it is asked where
that tool call is. It shows the arguments in full, takes an optional line back to
the model, and offers a "remember this" box:

```ts path=packages/plugin-hitl/examples/readsAreFree.ts
import type { Plugin } from "@tiny/plugin";
import { humanInTheLoop } from "@tiny/plugin-hitl";

/**
 * Reading is cheap and reversible; writing is neither. Naming the safe tools is
 * usually all the policy an app needs.
 */
export const plugins: readonly Plugin[] = [
  humanInTheLoop({
    allow: ["fs_list", "fs_read"],
    deny: ["fs_delete"],
    labels: { fs_write: "Write File", fs_edit: "Edit File" },
  }),
];
```

Rules resolve most-binding-first: `decide(call)` (the only one that sees the
arguments), then `deny`, then whatever the user chose to remember, then `allow`,
then the fallback — which is to ask. Dismissing the card denies, because a closed
dialog is not consent.

## Endpoints without tool support

Tool definitions are sent with the request. An endpoint that does not support
tool calling ignores them, and the conversation proceeds as if no tool were
registered — nothing errors. This is why `fileSystem()` can ship enabled by
default in the app's registry.
