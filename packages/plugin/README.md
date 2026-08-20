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

## The files

Read them in this order; each answers one question.

| File | Answers |
| --- | --- |
| `src/pi.ts` | What can a plugin call, and what does it get back? The whole contract. |
| `src/registry.ts` | `loadPlugins` — running every factory once and collecting what it registered. |
| `src/PluginHost.tsx` | The React host: dialogs, toasts, widgets, statuses, and the live `ctx`. |
| `src/hooks.ts` | What the app calls to reach the host — `usePluginContext`, `usePluginTools`, … |
| `src/Slot.tsx` | Where contributed components render, and what happens when one throws. |
| `src/Overlays.tsx` | How the four pi dialogs, a custom React overlay and toasts are painted. |
| `src/providers.ts` | Endpoints a plugin adds to the model picker. |
| `src/keys.ts`, `src/theme.ts` | Two small pi shapes: keybindings, and the no-op theme. |
| `src/events.ts`, `src/externalStore.ts` | The plugin-to-plugin bus, and the state primitive plugins hold UI in. |

## A plugin is a factory

The same shape `@tiny/ai` extensions already use, so a plugin that only subscribes to
events *is* an `@tiny/ai` extension:

```ts
export type Plugin = (pi: PluginAPI) => void | Promise<void>;
```

## Usage

Add a button to every finished reply — `examples/copyButton.tsx`:

```tsx
import type { Plugin } from "@tiny/plugin";
import { definePlugin, usePluginContext } from "@tiny/plugin";

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

  return definePlugin("copyButton", (pi) => {
    pi.contribute("message.actions", CopyAction);
  });
};
```

Register a command and a shortcut, and confirm before destroying anything —
`examples/clearChat.ts`. Every call in this file is pi's, with pi's signatures, so it would
run unchanged under `.pi/extensions/`:

```ts
import type { Plugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * A command and a shortcut, with a confirmation before anything is lost.
 *
 * Every call here is pi's, with pi's signatures — this file would run
 * unmodified as a pi extension under `.pi/extensions/`.
 */
export const clearChat = (): Plugin =>
  definePlugin("clearChat", (pi) => {
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
  });
```

Subscribe to a stream event and draw with plain strings — `examples/tokenMeter.ts`:

```ts
import type { Plugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * An event subscriber that draws with `setWidget`.
 *
 * Both halves are pi's: `pi.on` is the same subscription `@tiny/ai` extensions
 * already use, and `setWidget` carries plain string lines — all the RPC
 * protocol supports, and therefore all a portable pi extension can rely on.
 */
export const tokenMeter = (): Plugin =>
  definePlugin("tokenMeter", (pi) => {
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
  });
```

Persist your own state and push text at the composer — `examples/savedPrompts.tsx`:

```tsx
import type { Plugin } from "@tiny/plugin";
import { definePlugin, usePluginContext } from "@tiny/plugin";

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
        className="h-7 rounded-control px-1.5 text-sm text-ink-2 hover:bg-hover hover:text-ink"
        onClick={() => void ctx.runCommand("prompts")}
      >
        Prompts
      </button>
    );
  }

  return definePlugin("savedPrompts", (pi) => {
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
  });
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
| `message.pending` | inside the reply still being written — for whatever the run is waiting on |

Two more regions are driven by pi's own API rather than by `contribute`: `<Widgets
placement="aboveEditor" />` renders whatever `setWidget` holds, and `<StatusBar />` renders
`setStatus` entries.

### State a contribution shares with its commands

A command handler, a shortcut and a contributed component are three call sites that need
the same value, and only the last is a component — so the value lives in the factory's
closure and the component subscribes to it:

```tsx
import { createExternalStore } from "@tiny/plugin";

const open = createExternalStore(false);

function Overlay() {
  const shown = useSyncExternalStore(open.subscribe, open.get, open.get);
  return shown ? <Dialog onClose={() => open.set(false)} /> : null;
}

pi.registerCommand("settings", { handler: () => open.set(true) });
pi.contribute("app.overlays", Overlay);
```

`createExternalStore(initial)` returns `{ get, set, subscribe }` over any value — the
provider registry, `@tiny/plugin-hitl`'s pending approval and the app's own settings
dialog are all one of these.

## Events

`pi.on` carries the six events `@tiny/ai` fires — `before_agent_start`, `context`,
`message_start`, `message_update`, `message_end` and `tool_call`. See the "Extensions"
section of `packages/ai/README.md` for their payloads and chaining rules; nothing about
them changes here.

`tool_call` is the one with teeth: it fires before a tool runs, `event.input` is mutable
so a handler can patch the arguments in place, and `{ block: true, reason }` stops the call
and hands the reason to the model as the tool's result. Handlers get the same context
commands do — `ctx.ui`, `ctx.hasUI`, `ctx.storage`, widened with the request's `model` and
`signal` — which is what lets pi's own permission gates run here unedited. See
`@tiny/plugin-hitl`.

Every other pi event name is **accepted without error** and simply never fires, so a pi
extension that subscribes to `session_start` or `turn_end` still loads.

## How this differs from pi

Honest accounting, in the manner of `packages/ai/README.md`, so nothing here is mistaken
for full SDK conformance.

**Inherited verbatim** — same names, argument order and return values:

| | |
| --- | --- |
| `pi.on(event, handler)` | for the six events above |
| `pi.registerCommand(name, { description, getArgumentCompletions, handler })` | `handler(args, ctx)` |
| `pi.registerShortcut(key, { description, handler })` | pi's `KeyId` format; modifiers are `ctrl` / `shift` / `alt` / `super` |
| `pi.registerTool(tool)` | pi's `execute(toolCallId, params, signal, onUpdate, ctx)` and content-block result; `parameters` is plain JSON Schema |
| `pi.getCommands()` | extension commands, in invocation order |
| `pi.registerMarkdownTransformer(fn)` | chained in load order; pi's `availableWidth` has no meaning here and is omitted |
| `pi.events` | the shared bus between plugins — `on` / `once` / `off` / `emit` |
| `pi.getAllTools / getActiveTools / setActiveTools` | over the registry's tools |
| `pi.setModel(model)` | writes through to the app's settings |
| `pi.setSessionName / getSessionName` | the conversation's title |
| `ctx.abort()`, `ctx.isIdle()`, `ctx.hasPendingMessages()` | one reply at a time, so the last two are opposites |
| `ctx.getContextUsage()` | tokens for the turn; `contextWindow` is 0 unless the endpoint publishes one |
| `ctx.newSession()` | starts a fresh conversation |
| `ctx.reload()` | pi's `/reload` flow, over plugin factories rather than files on disk |
| `ctx.ui.select / confirm / input` | including `{ timeout, signal }` and pi's dismissal values |
| `ctx.ui.editor(title, prefill)` | pi takes no options here, so neither do we |
| `ctx.ui.notify / setStatus / setWidget / setTitle / setEditorText / pasteToEditor` | fire-and-forget |
| `ctx.mode`, `ctx.hasUI`, `ctx.signal` | `mode` is `"react"` |

**Degraded exactly as pi's RPC mode degrades them** — present, never throwing:

| Method | Returns |
| --- | --- |
| `custom()` | `undefined` |
| `getToolsExpanded()` | `false` |
| `getAllThemes()` | `[]` |
| `getTheme()` | `undefined` |
| `setTheme()` | `{ success: false, error }` |
| `setWorkingMessage`, `setWorkingVisible`, `setWorkingIndicator`, `setHiddenThinkingLabel`, `setFooter`, `setHeader`, `setEditorComponent`, `setToolsExpanded`, `onTerminalInput`, `addAutocompleteProvider` | no-op |
| `ctx.ui.theme` | every method is the identity, so `theme.fg("accent", "●")` yields `"●"` rather than throwing |

**Omitted** — no analogue in a browser chat:

| pi has | Why not here |
| --- | --- |
| `registerFlag`, `getFlag` | no CLI to parse flags from |
| `exec` | no shell in a browser |
| `sendMessage`, `appendEntry`, `setLabel` | no session entries to append or label |
| `registerMessageRenderer`, `registerEntryRenderer` | they return `pi-tui` components; the concept ports, the signature does not |
| `sendUserMessage(content, { deliverAs })` | `pi.sendUserMessage(content)` exists; there is no follow-up queue to deliver into |
| `getThinkingLevel`, `setThinkingLevel`, `ctx.scopedModels` | no thinking-level or scoped-model concept behind a bare endpoint |
| `ctx.sessionManager`, `ctx.cwd`, `ctx.modelRegistry`, `ctx.model` | no session store, filesystem or pi-ai model registry |
| Auto-discovery from `~/.pi/agent/extensions/` | plugins are listed in the app's registry, or installed at runtime |
| `ctx.compact`, `waitForIdle`, `fork`, `navigateTree`, `switchSession`, `shutdown`, `isProjectTrusted` | no compaction, session tree or project trust here |

**Reduced** — pi's name and intent, with less behind it:

| | What survives |
| --- | --- |
| `pi.registerProvider(id, config)` | base URL, auth and a model list. pi's credential store, catalog persistence and native `pi-ai` `Provider` have nowhere to live, and `@tiny/ai` streams to an endpoint directly rather than through pi-ai's registry |
| `pi.unregisterProvider(id)` | complete |
| `ctx.ui.pasteToEditor` | appends rather than inserting at a cursor; pi's RPC mode degrades this further, to a plain replace |

**Ours** — no pi equivalent:

| | |
| --- | --- |
| `pi.contribute(slot, Component)` | React components into named regions |
| `ctx.ui.open(render)` | a React component as a modal, resolving when it closes |
| `ctx.chat`, `ctx.settings`, `ctx.navigate`, `ctx.storage`, `ctx.runCommand`, `ctx.commands` | the app's own state and actions |

`ctx.reload()` is **pi's**, adapted rather than invented: pi runs the `/reload` flow over
extensions discovered on disk, and this re-runs every plugin factory and rebuilds the
registry. Both resolve once the new runtime is live, and in both a plugin that no longer
registers is simply gone — registrations have no undo of their own, so unloading *is*
rebuilding. Here it is additionally how a plugin installed at runtime is applied; see
[`@tiny/plugin-manager`](../plugin-manager/README.md).

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

`execute` takes pi's positional arguments and returns pi's content blocks, so a tool
written for pi runs here unmodified:

```ts
execute(toolCallId, params, signal, onUpdate, ctx): Promise<ToolResult> | ToolResult
```

`toolOutput(text, rest?)` builds that result from a string, and `toolText(result)` reads
one back. `onUpdate` pushes progress while a long tool runs, and it shows up as the tool's
summary line. `label`, `promptSnippet`, `promptGuidelines`, `prepareArguments`, `details`
and `terminate` are all pi's, with pi's meanings — prompt fields are folded into the system
prompt before `before_agent_start` fires, and `terminate` ends the turn only when every
result in the batch asks for it.

One deliberate difference remains: `parameters` is a plain JSON Schema object rather than a
typebox `TSchema`. A typebox schema *is* a JSON Schema object at runtime, so definitions
port unchanged — and typebox stays out of the browser bundle, which the "Browser notes" in
[`@tiny/ai`](../ai) explains is not optional here.

Throwing from `execute` is normal control flow: the message becomes an error result the
model reads and can correct, rather than failing the turn. Tool names must be unique
across all plugins — unlike commands, a duplicate cannot be suffixed, so the first
registration wins and the clash is logged.

## Adding an endpoint

`registerProvider` puts another OpenAI-compatible endpoint in the model picker —
`examples/groqProvider.ts`:

```ts
import type { Plugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * An endpoint added to the model picker — pi's `registerProvider`, reduced to
 * the part that survives a browser.
 *
 * pi's version also carries credential storage, catalog persistence and a
 * native `pi-ai` provider; none has anywhere to live here. What remains is what
 * actually travels: where to send the request, how to authenticate, and which
 * models exist.
 */
export const groq = (): Plugin =>
  definePlugin("groq", (pi) => {
    pi.registerProvider("groq", {
      name: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      // Omitting `models` asks the endpoint's own /models route, which is what an
      // OpenAI-compatible server publishes.
      models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
      // A thunk rather than a string, so the key is fetched when a request needs
      // it instead of sitting in the registry where `ctx.settings` would expose
      // it to every other plugin.
      apiKey: () => localStorage.getItem("groq:key") ?? "",
    });

    pi.registerCommand("groq:key", {
      description: "Set the Groq API key",
      handler: async (args, ctx) => {
        const key = args !== "" ? args : await ctx.ui.input("Groq API key", "gsk_…");
        if (key === undefined || key === "") return;
        localStorage.setItem("groq:key", key);
        ctx.ui.notify("Groq key saved", "info");
      },
    });

    pi.registerCommand("groq:off", {
      description: "Remove the Groq provider",
      // Registering and unregistering both work after the factory has returned,
      // as they do in pi — the picker updates without a reload.
      handler: (_args, ctx) => {
        ctx.ui.notify(pi.unregisterProvider("groq") ? "Groq removed" : "Groq was not registered");
      },
    });
  });
```

### API types

`api` is pi's api type identifier, and it chooses the streaming implementation.
Set it on the provider and override it per model, as pi allows —
`examples/anthropicProvider.ts`:

```ts
import type { Plugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * A provider that is not OpenAI-shaped.
 *
 * `api` is pi's api type identifier, and it decides which streaming
 * implementation the request goes through. It may be set for the whole endpoint
 * and overridden per model, exactly as pi allows.
 *
 * pi-ai already configures the Anthropic SDK for browser use — it sends
 * `anthropic-dangerous-direct-browser-access`, without which Anthropic refuses a
 * cross-origin request outright — so this works from a page with no proxy.
 */
export const anthropic = (apiKey: () => string): Plugin =>
  definePlugin("anthropic", (pi) => {
    pi.registerProvider("anthropic", {
      name: "Anthropic",
      // No `/v1`: the Anthropic implementation appends its own.
      baseUrl: "https://api.anthropic.com",
      api: "anthropic-messages",
      apiKey,
      // A bare model id is enough. An object says what the endpoint's own model
      // route cannot: that this one reasons, and how much context it has — which
      // is what makes `ctx.getContextUsage()` report a real window rather than 0.
      models: [
        "claude-haiku-4-5",
        { id: "claude-opus-4-6", reasoning: true, contextWindow: 200_000 },
      ],
    });
  });
```

Six of pi's nine implementations reach a browser and are offered:
`openai-completions` (the default), `openai-responses`, `azure-openai-responses`,
`anthropic-messages`, `mistral-conversations` and `google-generative-ai`. The other three
cannot run in a page and are left out rather than failing at runtime:
`openai-codex-responses` imports `node:zlib`, `google-vertex` signs a service-account JWT
through `GoogleAuth`, and `bedrock-converse-stream` transports over
`@smithy/node-http-handler`.

Each implementation sits behind its own dynamic import, so a bundler with code splitting
downloads only the one an endpoint actually uses.

pi's config also carries credential storage, catalog persistence and a native `pi-ai`
provider; none has anywhere to live here, and `@tiny/ai` streams to an endpoint directly
rather than through pi-ai's registry. What remains is what travels: the api, the base URL,
how to authenticate, and which models exist. Registering after the factory has returned
takes effect immediately, as pi documents — the picker updates without a reload.

## Adding one to the chat app

Write the plugin under `apps/chat/src/plugins/` and list it in that folder's registry.
That is the whole wiring — nothing in `@tiny/ai`, `@tiny/plugin`, `useChat` or any
component changes:

```ts
import { greet } from "./greet.ts";

export const plugins: readonly Plugin[] = [
  // …the plugins already there…
  greet(),
];
```

The list itself lives in [`apps/chat/src/plugins/index.ts`](../../apps/chat/src/plugins/index.ts);
it is the one place that decides what the app runs, so it is not repeated here.

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
