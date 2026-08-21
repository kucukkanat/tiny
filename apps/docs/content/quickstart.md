# Quickstart

Two paths. The first ships a plugin **in the build** — the way you develop one.
The second installs a plugin **at runtime** — the way someone else uses what you
wrote. Do both; they take about five minutes together.

## Get the app running

```bash
git clone https://github.com/kucukkanat/tiny
cd tiny
bun install
bun run dev
```

Open the app, click the settings gear, and give it an **API**, a base URL
(`https://api.openai.com/v1`, or `http://localhost:11434/v1` for Ollama), a key,
and a model. Everything stays in your browser — nothing is proxied.

Leave the API on **OpenAI Chat Completions** unless your endpoint is Anthropic,
Google or Mistral — that setting is what "OpenAI-compatible" means, and it covers
Ollama, vLLM, LM Studio, Groq, Together and OpenRouter. If you do pick another,
read [api types](providers.md#api-types) first: the base URL is a different shape
for some of them.

## Write a bundled plugin

Create `apps/chat/src/greet.ts` — this is the runnable copy that lives
in the repo, and a test asserts this page still matches it:

```ts path=packages/plugin/examples/greet.ts
import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * The smallest useful plugin: one command.
 *
 * `definePlugin` gives it the id that namespaces `ctx.storage` and labels its
 * errors — declared rather than inferred, because a minifier erases function
 * names and this has to be the same in every build.
 */
export const greet = (): IdentifiedPlugin =>
  definePlugin("greet", (tiny) => {
    tiny.registerCommand("greet", {
      description: "Say hello",
      handler: (args, ctx) => {
        ctx.ui.notify(`Hello, ${args === "" ? "world" : args}`, "info");
      },
    });
  });
```

Add it to the registry in `apps/chat/src/plugins.ts` — an import and one
line in the list:

```ts
import { greet } from "./greet.ts";        // specifiers carry the extension;
                                           // a plugin that renders React is .tsx

export const plugins: readonly IdentifiedPlugin[] = [
  // …the plugins already there…
  greet(),
];
```

That is the whole wiring. Nothing in `@tiny/ai`, `@tiny/plugin`, `useChat` or any
component changes. Type `/greet` in the composer.

> **Order matters a little.** Two plugins may claim the same command name; both
> keep it and are disambiguated as `greet:1` and `greet:2` in load order, which
> is this list's order. Where that matters, a plugin can declare it —
> `pluginManager()` says `after: ["*"]` and loads last wherever you put it. See
> [Load order](anatomy.md#load-order).

## Add a button

`ctx` is available to commands and shortcuts as an argument, and to React through
`usePluginContext()`. This is `packages/plugin/examples/copyButton.tsx`,
run by the test suite:

```tsx path=packages/plugin/examples/copyButton.tsx
import type { IdentifiedPlugin, PropsOf } from "@tiny/plugin";
import { definePlugin, usePluginContext } from "@tiny/plugin";

/**
 * A button on every finished reply. `contribute` is the one part of the API pi
 * has no portable equivalent of — everything else here is pi's.
 *
 * `PropsOf<"message.actions">` is what that slot passes: a message and its
 * position, both always present. No hand-written prop type to drift from the
 * slot, and no null check for a value the slot guarantees.
 */
export const copyButton = (): IdentifiedPlugin => {
  function CopyAction({ message }: PropsOf<"message.actions">) {
    const ctx = usePluginContext();

    return (
      <button
        type="button"
        data-testid="copy-reply"
        className="rounded-control px-1.5 py-0.5 text-xs text-ink-3 hover:bg-hover hover:text-ink"
        onClick={() => {
          void navigator.clipboard?.writeText(message.content);
          ctx.ui.notify("Copied", "info");
        }}
      >
        Copy
      </button>
    );
  }

  return definePlugin("copyButton", (tiny) => {
    tiny.contribute("message.actions", CopyAction);
  });
};
```

Five slots exist. `message.actions` is the only one that receives props — the
message it is rendered under, and its index. See [Slots](slots.md).

## Install a plugin at runtime

Now the other direction: code the build never saw.

A runtime plugin is **one file with a default export**. Nothing else. Save this
as `shout.js` anywhere you can serve it from, or just copy it:

```js
export default (tiny) => {
  tiny.registerCommand("shout", {
    description: "Send the draft in caps",
    handler: (_args, ctx) => ctx.chat.send(ctx.ui.getEditorText().toUpperCase()),
  });
};
```

In the app, press `⌘⇧P` (or `Ctrl+Shift+P`), or click **Plugins** in the sidebar
footer, or type `/plugins`. Paste the source, review what it shows you, and
approve.

It runs from that moment on — no rebuild, no page reload. `/shout` is now a
command, sitting in the same registry as everything above.

> **You just executed someone's code in your page.** The dialog showed you the
> full source and its SHA-256 because that review is the only trust boundary
> there is. [How runtime plugins work](runtime.md) explains exactly what is and
> is not guaranteed after you click approve.

## Where things live

| | |
| --- | --- |
| Host, types, slots, `PluginHost` | `packages/plugin` |
| Runtime install, the Plugins dialog | `packages/plugin-manager` |
| Filesystem tools for the model | `packages/plugin-fs` |
| The app and its plugin registry | `apps/chat/src/plugins.ts` |

## Run the tests

```bash
bun test              # unit + integration, whole monorepo
bun test packages/plugin
bun run typecheck     # tsc, strict
bun run lint          # biome
```
