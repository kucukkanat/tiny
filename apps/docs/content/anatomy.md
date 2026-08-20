# Anatomy of a plugin

```ts
export type Plugin = (pi: PluginAPI) => void | Promise<void>;
```

A plugin is a function that receives the plugin API and registers things. It is
the same shape `@tiny/ai` extensions already use, which is why a plugin that only
subscribes to events *is* an `@tiny/ai` extension — the four observers that shipped
in the chat app needed no edit when this package arrived.

Export a **named factory**, not a default, and not the plugin itself:

```ts
import type { Plugin } from "@tiny/plugin";

export const tokenMeter = (options: { limit?: number } = {}): Plugin => (pi) => {
  // …registrations
};
```

The factory is where configuration goes, so the registry reads as a list of
configured plugins rather than a list of imports:

```ts
export const plugins: readonly Plugin[] = [fileSystem(), notion({ token })];
```

The one exception is a plugin meant to be installed at
[runtime](runtime.md#writing-an-installable-plugin), which must
`export default` a function because it is imported as a lone module.

## When factories run, and what identity they get

`loadPlugins` runs every factory once, in list order, awaiting each — so an
`async` factory can do real work before the next one starts. That is exactly how
[`@tiny/plugin-manager`](runtime.md) loads installed plugins into the same
registry.

Each plugin gets an id, used to namespace its storage and to attribute its
errors:

```ts
const pluginId = (plugin: Plugin, index: number): string =>
  plugin.name !== "" ? plugin.name : `plugin-${index}`;
```

That is the *function's* name, so `const greet = (): Plugin => (pi) => {}`
produces an anonymous inner function and falls back to `plugin-3`. If you want a
stable storage namespace, give the returned function a name:

```ts
export const greet = (): Plugin => {
  return function greet(pi) {
    // `ctx.storage` is now namespaced under "greet" rather than a positional id
  };
};
```

Factories run in an effect, so contributions appear just after first paint rather
than blocking it.

## Commands

```ts
pi.registerCommand(name, {
  description?: string,
  getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null | Promise<…>,
  handler(args: string, ctx: PluginContext): void | Promise<void>,
});
```

`args` is everything the user typed after the command name, unparsed and possibly
`""`. `ctx` is the [context object](context.md).

Two plugins may register the same name. Unlike a tool, a command can be
disambiguated, so **both survive**: pi's rule is numeric suffixes in load order,
and a name claimed only once is invoked bare.

| Registered | Invoked as |
| --- | --- |
| `review` (once) | `/review` |
| `review`, `review` | `/review:1`, `/review:2` |

A handler that throws is caught and reported through `ctx.ui.notify` rather than
propagating — see [what is caught and why](slots.md#errors).

`ctx.commands` lists every registered command, and `ctx.runCommand(name, args)`
invokes one, which is how a button in a slot triggers a command instead of
duplicating its body.

## Shortcuts

```ts
pi.registerShortcut("ctrl+shift+backspace", {
  description: "Clear the conversation",
  handler: (ctx) => ctx.runCommand("clear"),
});
```

Keys use pi's `KeyId` format. The modifier set is pi's exactly — `ctrl`, `shift`,
`alt`, `super` — and note there is **no `mod`**: register both `super+…` and
`ctrl+…` if you want the binding on macOS and elsewhere, which is what the
Plugins dialog itself does.

The base key is a letter, a digit, a symbol, or one of `escape` `enter` `tab`
`space` `backspace` `delete` `insert` `home` `end` `pageUp` `pageDown` `up`
`down` `left` `right`. Up to two modifiers are typed.

Here is a command and a shortcut together, with a confirmation before anything is
lost. Every call in this file is pi's, so it would run unchanged under
`.pi/extensions/`:

```ts path=packages/plugin/examples/clearChat.ts
import type { Plugin } from "@tiny/plugin";

/**
 * A command and a shortcut, with a confirmation before anything is lost.
 *
 * Every call here is pi's, with pi's signatures — this file would run
 * unmodified as a pi extension under `.pi/extensions/`.
 */
export const clearChat = (): Plugin => (pi) => {
  pi.registerCommand("clear", {
    description: "Start a new conversation",
    handler: async (_args, ctx) => {
      if (ctx.chat.messages.length === 0) {
        ctx.ui.notify("Nothing to clear", "info");
        return;
      }
      const ok = await ctx.ui.confirm("Clear chat?", "This conversation will be left behind.");
      if (ok) ctx.navigate("/");
    },
  });

  // pi's modifier set is ctrl / shift / alt / super — there is no `mod`.
  pi.registerShortcut("ctrl+shift+backspace", {
    description: "Clear the conversation",
    handler: (ctx) => ctx.runCommand("clear"),
  });
};
```

## Events

`pi.on(event, handler)` subscribes to the request lifecycle. Six events actually
fire, because six are all `@tiny/ai` emits:

| Event | Fires | Handler may return |
| --- | --- | --- |
| `before_agent_start` | before a request is sent | a modified request |
| `context` | while the message list is assembled | modified context |
| `message_start` | when a reply begins | — |
| `message_update` | on every streamed delta | — |
| `message_end` | on the finalized message, with usage | — |
| `tool_call` | before a tool runs, arguments final | `{ block, reason }` to stop it |

`tool_call` is the only one that can stop something happening, which makes it the
hook every approval flow hangs off — see [Approvals](tools.md#approvals-are-just-an-event).

Payloads and chaining rules are `@tiny/ai`'s and are documented in
`packages/ai/README.md`; nothing about them changes here.

**Every other pi event name is accepted and simply never fires.** A pi extension
subscribing to `session_start`, `tool_call` or `turn_end` loads without a type
error and without a runtime error — it just never hears from them. That is
deliberate: it is what lets a real pi extension load unmodified.

```ts path=packages/plugin/examples/tokenMeter.ts
import type { Plugin } from "@tiny/plugin";

/**
 * An event subscriber that draws with `setWidget`.
 *
 * Both halves are pi's: `pi.on` is the same subscription `@tiny/ai` extensions
 * already use, and `setWidget` carries plain string lines — all the RPC
 * protocol supports, and therefore all a portable pi extension can rely on.
 */
export const tokenMeter = (): Plugin => (pi) => {
  let total = 0;

  pi.on("message_end", (event, _ctx) => {
    total += event.message.usage.totalTokens;
  });

  pi.registerCommand("tokens", {
    description: "Show tokens used this session",
    handler: (_args, ctx) => {
      ctx.ui.setWidget("tokens", [`${total} tokens this session`], {
        placement: "aboveEditor",
      });
    },
  });

  pi.registerCommand("tokens:hide", {
    description: "Hide the token meter",
    handler: (_args, ctx) => ctx.ui.setWidget("tokens", undefined),
  });
};
```

Handlers are recorded during `loadPlugins` and replayed into whatever
`ExtensionAPI` the streaming client builds for a request, in registration order.
[Why that indirection exists](host.md#why-tiny-ai-needed-no-change).

## Tools

`pi.registerTool` gives the model something it can call. It has its own page:
[Tools for the model](tools.md).

## Providers

`pi.registerProvider(id, config)` adds another endpoint to the model picker, and
`pi.unregisterProvider(id)` takes it away again. Both work during the factory and
long after it returns: [Providers](providers.md).

## Markdown

`pi.registerMarkdownTransformer(fn)` rewrites message text on its way to the
screen. Transformers run in load order, each seeing the previous one's output:

```ts
pi.registerMarkdownTransformer((markdown, { messageType, isStreaming }) => {
  if (isStreaming || messageType === "assistant-thinking") return markdown;
  return markdown.replaceAll("-->", "→");
});
```

Display-only, as in pi: the original text is what stays in the conversation and in
the model's context. A transformer that throws is skipped with the markdown so far
kept, and the rest of the chain still runs — which is what makes it safe to run on
every streamed frame. Keep it synchronous and cheap for the same reason.

pi's context also carries `availableWidth`; a browser has no column count, so that
field is absent here.

## Talking to other plugins

`pi.events` is a bus plugins share — deliberately not the lifecycle events of
`pi.on`, so a plugin emitting `message_end` cannot fool another plugin's handler.

```ts
pi.events.on("todo:changed", (data) => refresh(data));
pi.events.emit("todo:changed", { count: 3 });
```

`on` returns an unsubscribe function; `once` and `off` are there too. A listener
that throws is logged and the rest still run.

## Reading and driving the app

These reach the running host, and may be called at any time — from the factory,
from a command handler, from an event.

| Call | Does |
| --- | --- |
| `pi.getCommands()` | every command available to `runCommand` |
| `pi.getAllTools()` | every registered tool name |
| `pi.getActiveTools()` | the ones currently offered to the model |
| `pi.setActiveTools(names)` | narrow that list |
| `pi.setModel(model)` | switch the model the next request uses |
| `pi.sendUserMessage(content)` | send a message as the user |
| `pi.getSessionName()` / `setSessionName(name)` | the conversation's title |

Called before a `PluginHost` is mounted, each reports the fact and does nothing
rather than throwing — `loadPlugins` is usable on its own, in a test or a script.

## Slots

`pi.contribute(slot, Component)` renders React into one of four named regions:
[Slots and rendering](slots.md).

## Unregistering

There is no `off`, no `unregisterCommand`, and no return value to call. **The way
to unload a plugin is to rebuild the registry without it** — `ctx.reload()`
re-runs every factory from scratch, and whatever no longer registers is simply
gone.

That is not a gap; it is what makes disabling a runtime plugin actually work.
[Reloading](runtime.md#reloading-is-how-unloading-works).
