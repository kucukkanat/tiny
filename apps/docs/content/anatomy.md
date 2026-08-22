# Anatomy of a plugin

```ts
// A plugin is a function. `definePlugin` gives it the id that namespaces its
// storage — see "Identity" below.
export type Plugin = {
  (tiny: PluginAPI): void | Promise<void>;
  readonly id?: string | undefined;
};
export type IdentifiedPlugin = Plugin & { readonly id: string };

export const definePlugin: (
  id: string,
  setup: (tiny: PluginAPI) => void | Promise<void>,
) => IdentifiedPlugin;
```

A plugin is a function that receives the plugin API and registers things. It is
the same shape `@tiny/ai` extensions already use, which is why a plugin that only
subscribes to events *is* an `@tiny/ai` extension — the four observers that shipped
in the chat app needed no edit when this package arrived.

Export a **named factory**, not a default, and not the plugin itself:

```ts
import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

export const tokenMeter = (options: { limit?: number } = {}): IdentifiedPlugin =>
  definePlugin("tokenMeter", (tiny) => {
    // …registrations
  });
```

The factory is where configuration goes, so the registry reads as a list of
configured plugins rather than a list of imports:

```ts
export const plugins: readonly IdentifiedPlugin[] = [fileSystem(), notion({ token })];
```

The one exception is a plugin meant to be installed at
[runtime](runtime.md#writing-an-installable-plugin), which must
`export default` a function because it is imported as a lone module.

## When factories run, and what identity they get

`loadPlugins` runs every factory once, in list order, awaiting each — so an
`async` factory can do real work before the next one starts. That is exactly how
[`@tiny/plugin-manager`](runtime.md) loads installed plugins into the same
registry.

A plugin's id is **declared**, with `definePlugin`. It namespaces `ctx.storage`
and labels the plugin's errors:

```ts
export const greet = (): IdentifiedPlugin =>
  definePlugin("greet", (tiny) => {
    // ctx.storage for this plugin lives under "greet"
  });
```

It has to be written down because it cannot be inferred. `Function.name` looks
like the obvious source — but every minifier erases it, so a plugin identified
that way has one identity under `bun run dev` and a different one in the build
your users run, which quietly moves their stored data on release.

A plugin with no id still loads, and everything works except persistence: it is
labelled by its position in the list, and `ctx.storage` keeps its values only
until the page reloads, with a warning the first time it stores anything. That
is fine for a throwaway. Persisting under a position would be worse than not
persisting at all — the position moves whenever the list does, and the data goes
somewhere nothing looks for it.

Factories run in an effect, so contributions appear just after first paint rather
than blocking it.

## What a plugin asks for

By default a plugin is handed everything `ctx` carries, including the user's API
key — which is right for the plugin that edits the settings and wrong for the
one that counts tokens. Declaring `needs` narrows it:

```ts
definePlugin("fileSystem", { needs: ["tools"] }, (tiny) => { … });
```

| Capability | Grants |
| --- | --- |
| `settings` | `ctx.settings`, which carries the API key, and `ctx.updateSettings` |
| `chat` | `ctx.chat.messages` and `ctx.chat.streaming` |
| `tools` | `tiny.registerTool` |

Everything else — dialogs, storage, commands, slots, `ctx.chat.send` — is
ungated, because withholding it would only break the plugin without protecting
anything.

**Opt-in, and narrowing.** Declare nothing and you get what plugins have always
got; declare `["tools"]` and you get tools, no settings and no conversation.
Nothing existing breaks, including pi extensions, which never declare.

> **It is a declaration, not a cage.** A plugin is ordinary code in your page:
> the settings it was not handed are still in `localStorage`, and nothing stops
> it calling `fetch`. What the declaration buys is real anyway — the plugin that
> only wanted to count tokens is no longer handed your key by accident, and a
> plugin that declares `["chat"]` and then reads the key out of `localStorage`
> has done something a reviewer can point at. That is the difference between a
> mistake and a lie, and it is the honest ceiling for a plugin that renders
> React into the same page as the app.

A plugin **installed at runtime** cannot narrow itself: it runs through
`@tiny/plugin-manager`'s `tiny`, so it gets what that plugin gets. The Plugins
dialog says so, next to the hash you are approving.

## Load order

The list decides it, and for almost everything that is enough — `tool_call`
fires for every tool in the registry however late it was registered. Where the
order really matters, say so rather than writing it in a comment:

```ts
definePlugin("pluginManager", { after: ["*"] }, (tiny) => { … });
```

| Declared | Means |
| --- | --- |
| `after: ["fs"]` | load after the plugin whose id is `fs` |
| `before: ["fs"]` | load before it |
| `after: ["*"]` | load after every other plugin |
| `before: ["*"]` | load before every other plugin |

The rule, applied until every plugin has run: **take the earliest-listed plugin
whose prerequisites have already run.** So a list with no constraints in it runs
exactly as written, and a plugin held back lets the ones behind it past.

A name that is not installed is ignored rather than reported — `after: ["fs"]`
from a plugin that merely prefers to follow the filesystem tools must not break
when they are absent. A cycle is reported and the plugins in it fall back to
list order, because losing them entirely is a worse answer to "these two
disagree about which goes first".

`@tiny/plugin-manager` is the real case: a plugin installed at runtime that
loaded first would claim `plugins` and push the manager to `plugins:2`, leaving
the user no obvious way back in to remove it. It declares `after: ["*"]`, so it
loads last however the app's list is written.

## Commands

```ts
tiny.registerCommand(name, {
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
tiny.registerShortcut("ctrl+shift+backspace", {
  description: "Clear the conversation",
  handler: (ctx) => ctx.runCommand("clear"),
});
```

Keys use pi's `KeyId` format. The modifier set is pi's — `ctrl`, `shift`,
`alt`, `super` (Cmd on macOS) — plus one of ours: **`mod`**, which matches Cmd
on Apple hardware and Ctrl everywhere else. One `mod+shift+p` covers what used
to take two registrations, and it is what the Plugins dialog itself binds. A
plugin porting back to pi should spell the pair out, since pi has no `mod`.

The base key is a letter, a digit, a symbol, or one of `escape` `enter` `tab`
`space` `backspace` `delete` `insert` `home` `end` `pageUp` `pageDown` `up`
`down` `left` `right`. Up to two modifiers are typed.

Here is a command and a shortcut together, with a confirmation before anything is
lost. Every call in this file is pi's, so it would run unchanged under
`.pi/extensions/` — the object is named `tiny` here, but that is the factory's
parameter and pi never sees it:

```ts path=packages/plugin/examples/clearChat.ts
import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * A command and a shortcut, with a confirmation before anything is lost.
 *
 * Every call here is pi's, with pi's signatures — this file would run
 * unmodified as a pi extension under `.pi/extensions/`. The object is named
 * `tiny` rather than `pi` only because it is this factory's parameter.
 */
export const clearChat = (): IdentifiedPlugin =>
  definePlugin("clearChat", (tiny) => {
    tiny.registerCommand("clear", {
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
    tiny.registerShortcut("ctrl+shift+backspace", {
      description: "Clear the conversation",
      handler: (ctx) => ctx.runCommand("clear"),
    });
  });
```

## Panels and pages

```ts
tiny.registerPanel("outline", { title: "Outline", component: Outline });
tiny.registerRoute("/scratchpad", { component: Scratchpad, label: "Scratchpad" });
```

A panel is a region of your own in the app's right-hand rail — a rail that does
not exist at all until some plugin registers one. A page is a whole screen at an
address, replacing the thread while the app's chrome stays put. Both are covered
in [Panels and pages](panels.md).

## Events

`tiny.on(event, handler)` subscribes to the request lifecycle. Six events actually
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
subscribing to `session_start`, `turn_end` or `session_compact` loads without a
type error and without a runtime error — it just never hears from them. That is
deliberate: it is what lets a real pi extension load unmodified.

```ts path=packages/plugin/examples/tokenMeter.ts
import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * An event subscriber that draws with `setWidget`.
 *
 * Both halves are pi's: `on` is the same subscription `@tiny/ai` extensions
 * already use, and `setWidget` carries plain string lines — all the RPC
 * protocol supports, and therefore all a portable pi extension can rely on.
 */
export const tokenMeter = (): IdentifiedPlugin =>
  definePlugin("tokenMeter", (tiny) => {
    let total = 0;

    tiny.on("message_end", (event, _ctx) => {
      total += event.message.usage.totalTokens;
    });

    tiny.registerCommand("tokens", {
      description: "Show tokens used this session",
      handler: (_args, ctx) => {
        ctx.ui.setWidget("tokens", [`${total} tokens this session`], {
          placement: "aboveEditor",
        });
      },
    });

    tiny.registerCommand("tokens:hide", {
      description: "Hide the token meter",
      handler: (_args, ctx) => ctx.ui.setWidget("tokens", undefined),
    });
  });
```

Handlers are recorded during `loadPlugins` and replayed into whatever
`ExtensionAPI` the streaming client builds for a request, in registration order.
[Why that indirection exists](host.md#why-tiny-ai-needed-no-change).

## Tools

`tiny.registerTool` gives the model something it can call. It has its own page:
[Tools for the model](tools.md).

## Providers

`tiny.registerProvider(id, config)` adds another endpoint to the model picker, and
`tiny.unregisterProvider(id)` takes it away again. Both work during the factory and
long after it returns: [Providers](providers.md).

## Markdown

`tiny.registerMarkdownTransformer(fn)` rewrites message text on its way to the
screen. Transformers run in load order, each seeing the previous one's output:

```ts
tiny.registerMarkdownTransformer((markdown, { messageType, isStreaming }) => {
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

`tiny.events` is a bus plugins share — deliberately not the lifecycle events of
`tiny.on`, so a plugin emitting `message_end` cannot fool another plugin's handler.
It is the only place plugins compose with **each other** rather than with the
host, which makes it the only place where the contract is between two plugins
and nobody else can check it. So write it down:

```ts
// The publisher exports this. It is the whole contract.
export const changed = defineChannel<{ id: string; title: string }>("notes.changed");

// In the publisher:
tiny.events.emit(changed, { id, title });

// In a subscriber, which imports the channel and nothing else:
tiny.events.on(changed, (note) => refresh(note.id));   // `note` is typed
```

A channel is a name with a payload type attached. Emitting the wrong shape or
reading a field that is not there is a compile error, where before both sides
had a bare string and `unknown` and agreed by hope.

Namespace the name with your plugin's id: the bus is one flat namespace, and
`changed` is a claim every other plugin can also make.

Bare strings still work and address the same channels, so a plugin written
before yours — or one written in plain JavaScript and installed at runtime —
still talks to one that uses them:

```ts
tiny.events.emit("notes.changed", { id, title });   // reaches `on(changed, …)`
```

`on` returns an unsubscribe function; `once` and `off` are there too. A listener
that throws is logged and the rest still run.

**A worked pair.** `@tiny/plugin-hitl` exports `approvalDecided` and emits on it
every time it settles a tool call; `@tiny/plugin-trace`'s `approvalLog`
subscribes and writes the audit line. Neither imports anything else of the
other's, the order they are listed in does not matter, and removing either
leaves the other working — a channel with no publisher is silent, and one with
no subscriber is a no-op.

## Reading and driving the app

These reach the running host, and may be called at any time — from the factory,
from a command handler, from an event.

| Call | Does |
| --- | --- |
| `tiny.getCommands()` | every command available to `runCommand` |
| `tiny.getAllTools()` | every registered tool name |
| `tiny.getActiveTools()` | the ones currently offered to the model |
| `tiny.setActiveTools(names)` | narrow that list |
| `tiny.setModel(model)` | switch the model the next request uses |
| `tiny.sendUserMessage(content)` | send a message as the user |
| `tiny.getSessionName()` / `setSessionName(name)` | the conversation's title |

Called before a `PluginHost` is mounted, each reports the fact and does nothing
rather than throwing — `loadPlugins` is usable on its own, in a test or a script.

## Slots

`tiny.contribute(slot, Component)` renders React into a named region — the app
declares five, and a plugin can declare its own:
[Slots and rendering](slots.md).

## Unregistering

**Every `register*` returns a function that undoes it.** Ignore it and the
registration lasts as long as the page, which is what almost every plugin wants;
keep it and you can take the registration back:

```ts
definePlugin("draft", (tiny) => {
  let off: (() => void) | undefined;

  tiny.on("turn_start", (_event, ctx) => {
    // A command that only makes sense mid-reply, withdrawn when it is not.
    off ??= tiny.registerCommand("interrupt", { handler: (_a, c) => c.abort() });
  });
  tiny.on("turn_end", () => {
    off?.();
    off = undefined;
  });
});
```

Calling it twice is harmless — the second call finds nothing to withdraw.

To take out a whole plugin rather than one registration, the host has
`registry.dispose(pluginId)`, which withdraws everything that plugin registered
and leaves every other plugin running. `ctx.reload()` is still there and still
rebuilds the registry from scratch; it is the bigger hammer, for when the plugin
*list* itself changed. [Reloading](runtime.md#disabling-and-reloading).
