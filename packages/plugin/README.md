# @tiny/plugin

UI plugins for the Tiny chat app, shaped after **pi's extension SDK**
([`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi), see its
`docs/extensions.md`).

`@tiny/ai` already runs pi-shaped extensions, but only over the *request* — its README
lists pi's `registerCommand`, `registerShortcut` and `ctx.ui` as "not implemented — there
is no agent loop, tool executor or command palette to register into." This package is that
command palette, that shortcut table and that `ctx.ui`.

**A pi extension that touches only RPC-portable methods runs here unmodified.**

## Why the pi API works in a browser

pi's extension UI is already renderer-agnostic, because pi runs extensions against a
non-terminal frontend in **RPC mode**. `ctx.mode` is `"tui" | "rpc" | "json" | "print"`
and `ctx.hasUI` is true in both TUI *and* RPC, and `docs/rpc.md` §"Extension UI Protocol"
documents exactly which `ctx.ui` methods survive that transition.

The rule is mechanical: **if a signature mentions `tui`, `theme`, or a
`(tui, theme) => Component` factory, it does not port.** Everything else is pure intent —
"ask the user to pick one of these" — and renders as a React modal as readily as a TUI
dialog. This package is, in effect, a fourth `ctx.mode`, and it reports itself as one:

```ts
ctx.mode === "react"   // so a pi extension's `ctx.mode === "tui"` guard stays false
ctx.hasUI === true     // dialogs work, as in RPC
```

Everything pi's RPC mode no-ops is still **present**, returning pi's documented fallback,
so a pi extension degrades here exactly as it would over RPC instead of throwing on a
missing method.

## A plugin is a factory

The same shape `@tiny/ai` extensions already use, so a plugin that only subscribes to
events *is* an `@tiny/ai` extension:

```ts
export type Plugin = (pi: PluginAPI) => void | Promise<void>;
```

## Usage

Add a button to every finished reply — `examples/CopyButtonExample.tsx`:

```tsx
import type { Plugin } from "@tiny/plugin";
import { usePluginContext } from "@tiny/plugin";

/**
 * A button on every finished reply. `contribute` is the one part of the API pi
 * has no portable equivalent of — everything else here is pi's.
 */
export const copyButton = (): Plugin => {
  function CopyAction({ message }: { message?: { content: string } | undefined }) {
    const ctx = usePluginContext();
    if (message === undefined) return null;

    return (
      <button
        type="button"
        data-testid="copy-reply"
        className="rounded-control px-1.5 py-0.5 text-[11.5px] text-ink-3 hover:bg-hover hover:text-ink"
        onClick={() => {
          void navigator.clipboard?.writeText(message.content);
          ctx.ui.notify("Copied", "info");
        }}
      >
        Copy
      </button>
    );
  }

  return (pi) => {
    pi.contribute("message.actions", CopyAction);
  };
};
```

Register a command and a shortcut, and confirm before destroying anything —
`examples/clearChat.ts`. Every call in this file is pi's, with pi's signatures, so it would
run unchanged under `.pi/extensions/`:

```ts
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

Subscribe to a stream event and draw with plain strings — `examples/tokenMeter.ts`:

```ts
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

Persist your own state and push text at the composer — `examples/SavedPromptsExample.tsx`:

```tsx
import type { Plugin } from "@tiny/plugin";
import { usePluginContext } from "@tiny/plugin";

/**
 * Per-plugin storage and a composer button, together.
 *
 * `ctx.storage` is namespaced to this plugin, so nothing it writes can collide
 * with the app's own keys or with another plugin's.
 */
export const savedPrompts = (): Plugin => {
  function SaveButton() {
    const ctx = usePluginContext();

    return (
      <button
        type="button"
        data-testid="save-prompt"
        className="h-7 rounded-control px-1.5 text-[12px] text-ink-2 hover:bg-hover hover:text-ink"
        onClick={() => void ctx.runCommand("prompts")}
      >
        Prompts
      </button>
    );
  }

  return (pi) => {
    pi.registerCommand("prompts", {
      description: "Insert a saved prompt",
      handler: async (_args, ctx) => {
        const saved = ctx.storage.get<string[]>("saved") ?? [
          "Explain this like I am five.",
          "Rewrite this more concisely.",
        ];
        const choice = await ctx.ui.select("Saved prompts", saved);
        if (choice !== undefined) ctx.ui.setEditorText(choice);
      },
    });

    pi.registerCommand("prompts:add", {
      description: "Save a prompt for later",
      handler: async (args, ctx) => {
        const text = args !== "" ? args : await ctx.ui.input("Save a prompt", "Type it here");
        if (text === undefined || text === "") return;
        const saved = ctx.storage.get<string[]>("saved") ?? [];
        ctx.storage.set("saved", [...saved, text]);
        ctx.ui.notify("Saved", "info");
      },
    });

    pi.contribute("composer.actions", SaveButton);
  };
};
```

## Slots

`contribute(slot, Component)` is the one thing here with no pi equivalent — pi's answer to
rich UI is `ctx.ui.custom()` and component factories, which are exactly the terminal-only
half. Contributed components receive `{ message, index }`; only `message.actions` fills
them.

| Slot | Renders |
| --- | --- |
| `app.overlays` | modals and palettes, above everything |
| `composer.actions` | inline beside the model picker |
| `sidebar.footer` | below the sidebar's settings row |
| `message.actions` | under each finished assistant reply |

Two more regions are driven by pi's own API rather than by `contribute`: `<Widgets
placement="aboveEditor" />` renders whatever `setWidget` holds, and `<StatusBar />` renders
`setStatus` entries.

## Events

`pi.on` carries the five events `@tiny/ai` fires — `before_agent_start`, `context`,
`message_start`, `message_update`, `message_end`. See the "Extensions" section of
`packages/ai/README.md` for their payloads and chaining rules; nothing about them changes
here.

Every other pi event name is **accepted without error** and simply never fires, so a pi
extension that subscribes to `session_start` or `tool_call` still loads.

## How this differs from pi

Honest accounting, in the manner of `packages/ai/README.md`, so nothing here is mistaken
for full SDK conformance.

**Inherited verbatim** — same names, argument order and return values:

| | |
| --- | --- |
| `pi.on(event, handler)` | for the five events above |
| `pi.registerCommand(name, { description, getArgumentCompletions, handler })` | `handler(args, ctx)` |
| `pi.registerShortcut(key, { description, handler })` | pi's `KeyId` format; modifiers are `ctrl` / `shift` / `alt` / `super` |
| `ctx.ui.select / confirm / input` | including `{ timeout, signal }` and pi's dismissal values |
| `ctx.ui.editor(title, prefill)` | pi takes no options here, so neither do we |
| `ctx.ui.notify / setStatus / setWidget / setTitle / setEditorText / pasteToEditor` | fire-and-forget |
| `ctx.mode`, `ctx.hasUI`, `ctx.signal` | `mode` is `"react"` |

**Degraded exactly as pi's RPC mode degrades them** — present, never throwing:

| Method | Returns |
| --- | --- |
| `custom()` | `undefined` |
| `getEditorText()` | `""` |
| `getToolsExpanded()` | `false` |
| `getAllThemes()` | `[]` |
| `getTheme()` | `undefined` |
| `setTheme()` | `{ success: false, error }` |
| `setWorkingMessage`, `setWorkingVisible`, `setWorkingIndicator`, `setHiddenThinkingLabel`, `setFooter`, `setHeader`, `setEditorComponent`, `setToolsExpanded`, `onTerminalInput`, `addAutocompleteProvider` | no-op |
| `ctx.ui.theme` | every method is the identity, so `theme.fg("accent", "●")` yields `"●"` rather than throwing |

**Omitted** — no analogue in a browser chat:

| pi has | Why not here |
| --- | --- |
| `registerTool`, `registerProvider`, `registerFlag` | no agent loop, tool executor, provider registry or CLI |
| `registerMessageRenderer`, `registerEntryRenderer` | they return `pi-tui` components; the concept ports, the signature does not |
| `ctx.sessionManager`, `ctx.cwd`, `ctx.modelRegistry` | no session store, filesystem or provider registry |
| `pi.sendMessage`, `pi.appendEntry`, `pi.exec` | no session entries and no shell |
| Auto-discovery from `~/.pi/agent/extensions/` | plugins are listed in the app's registry |

**Ours** — no pi equivalent:

| | |
| --- | --- |
| `pi.contribute(slot, Component)` | React components into named regions |
| `ctx.ui.open(render)` | a React component as a modal, resolving when it closes |
| `ctx.reload()` | re-run every factory and rebuild the registry, resolving when the new one is live |
| `ctx.chat`, `ctx.settings`, `ctx.navigate`, `ctx.storage`, `ctx.runCommand`, `ctx.commands` | the app's own state and actions |

`ctx.reload()` exists because pi discovers extensions from disk at startup and this host
does not: a plugin that installs other plugins — see
[`@tiny/plugin-manager`](../plugin-manager/README.md) — needs a way to apply the change
without a page reload. It is also how a plugin is *unloaded*: registrations have no undo,
so the registry is rebuilt from scratch and whatever no longer registers is simply gone.

One further deviation worth stating: **`@tiny/ai` catches nothing, and this package
catches deliberately.** That is right for a request and wrong for a render — one throwing
component would blank the app — so every contribution is wrapped in an error boundary, and
a throwing command handler is reported through `ctx.ui.notify` rather than propagating.

## Naming an extension package

A plugin big enough to live on its own becomes a package. The convention follows
`eslint-plugin-*` / `vite-plugin-*`, so it reads the same way to anyone arriving from npm:

| | |
| --- | --- |
| First-party | `@tiny/plugin-<name>` — e.g. [`@tiny/plugin-fs`](../plugin-fs) |
| Third-party, unscoped | `tiny-plugin-<name>` — searchable on npm |
| Third-party, scoped | `@<vendor>/tiny-plugin-<name>` |
| This package | `@tiny/plugin` — the host, never a plugin itself |

The rule of thumb: **`tiny-plugin-` appears in every plugin package name, and nowhere
else.** `@tiny/ai` and `@tiny/ui` are libraries, not plugins, and their names say so.

A plugin package should default-export nothing and instead export a named factory
returning a `Plugin`, so the registry reads as a list of configured plugins:

```ts
export const plugins: readonly Plugin[] = [fileSystem(), notion({ token })];
```

## Registering tools

`registerTool` adds a tool the model may call. `@tiny/ai` sends the definitions with the
request, executes each call, feeds the result back, and repeats until the model answers —
so a plugin only has to say what the tool does and how to run it.

```ts
pi.registerTool({
  name: "fs_read",
  description: "Read a text file and return its full contents.",
  parameters: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  },
  execute: async (args, ctx) => readFile(String(args.path), ctx.signal),
});
```

pi's name and shape, with one deliberate difference: `parameters` is a plain JSON Schema
object rather than a typebox `TSchema`. A typebox schema *is* a JSON Schema object at
runtime, so definitions port unchanged — and typebox stays out of the browser bundle,
which the "Browser notes" in [`@tiny/ai`](../ai) explains is not optional here.

Throwing from `execute` is normal control flow: the message becomes an error result the
model reads and can correct, rather than failing the turn. Tool names must be unique
across all plugins — unlike commands, a duplicate cannot be suffixed, so the first
registration wins and the clash is logged.

## Adding one to the chat app

Write the plugin under `apps/chat/src/plugins/` and list it in that folder's registry.
That is the whole wiring — nothing in `@tiny/ai`, `@tiny/plugin`, `useChat` or any
component changes:

```ts
export const plugins: readonly Plugin[] = [
  usageLogger(),
  streamTrace(),
  settings(),
];
```

`settings()` is the app's own endpoint dialog, shipped as a plugin rather than as app
structure — it reaches the screen through `app.overlays`, opens through a registered
command, and binds a shortcut, so the API is proven by a feature the app actually needs.

## Mounting the host

```tsx
<PluginHost plugins={plugins}>
  <App />
</PluginHost>
```

`App` publishes its chat state in with `useProvideApp` and renders `<Slot>`s where
contributions belong. `usePluginExtensions()` returns the `@tiny/ai` extensions the
registry collected, which `App` hands to `useChat`.

**Memoise what you pass to `useProvideApp`**, as you would a context value. The host
skips publishing when every field is referentially unchanged, so rebuilding the wrapper
object each render is safe — but a field that changes identity every render (an inline
arrow, a freshly-built array) will re-render the host in a loop. Watch for callbacks that
get folded into others: an inline `onConversationCreated` gives `useChat`'s `send` a new
identity every render, and `send` is on the bridge.

Plugin factories run in an effect, so contributions appear just after first paint rather
than blocking it.

## Why `@tiny/ai` needed no change

`loadExtensions` builds its own `ExtensionAPI` internally, so it can never be handed this
richer object — and it does not need to be. The host records every `on()` call while the
factories run and replays them into whatever API `streamChat` constructs:

```ts
const replay: Extension = (pi) => {
  for (const [event, handler] of recorded) pi.on(event, handler);
};
```

Order is preserved, and replay is idempotent because `loadExtensions` builds fresh handler
arrays on every call.

## Test

```sh
bun test
```

Every example above is a real file under `examples/`, rendered or executed by the suite,
and the README is asserted to embed each one verbatim — so a snippet cannot rot into
something that no longer runs.
