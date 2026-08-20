# @tiny/plugin

UI plugins for the Tiny chat app, shaped after **pi's extension SDK**
([`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi), see its
`docs/extensions.md`).

`@tiny/ai` already runs pi-shaped extensions, but only over the *request* — its README
lists pi's `registerCommand`, `registerShortcut` and `ctx.ui` as "not implemented — there
is no agent loop, tool executor or command palette to register into." This package is that
command palette, that shortcut table and that `ctx.ui`.

**A pi extension that touches only RPC-portable methods runs here unmodified.**

## A plugin

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
  definePlugin("greet", (pi) => {
    pi.registerCommand("greet", {
      description: "Say hello",
      handler: (args, ctx) => {
        ctx.ui.notify(`Hello, ${args === "" ? "world" : args}`, "info");
      },
    });
  });
```

List it in `apps/chat/src/plugins/index.ts` and it is live. That is the whole wiring —
nothing in `@tiny/ai`, `@tiny/plugin`, `useChat` or any component changes.

Nine more runnable plugins are in [`examples/`](examples), each executed by the test
suite: a composer button, a command with a confirmation, per-plugin storage, an event
subscriber that draws with `setWidget`, and two providers.

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

## Why `@tiny/ai` needed no change

`loadExtensions` builds its own `ExtensionAPI` internally, so it can never be handed this
richer object — and it does not need to be. The host records every `on()` call while the
factories run and replays them into whatever API `streamChat` constructs. Order is
preserved, and replay is idempotent because `loadExtensions` builds fresh handler arrays
on every call.

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

## Reference

The reference is [**the documentation site**](https://kucukkanat.github.io/tiny/), built
from [`apps/docs/content`](../../apps/docs/content). It is the one copy — this README
deliberately does not restate it, because two copies of an API reference disagree, and
these two did.

| Page | Covers |
| --- | --- |
| [Anatomy](../../apps/docs/content/anatomy.md) | the factory, identity, and everything it may register |
| [The context object](../../apps/docs/content/context.md) | dialogs, chat state, storage, navigation |
| [Slots](../../apps/docs/content/slots.md) | rendering React into the app, and error boundaries |
| [Tools](../../apps/docs/content/tools.md) | `registerTool`, and how a call becomes a result |
| [Providers](../../apps/docs/content/providers.md) | adding an endpoint to the model picker |
| [Runtime plugins](../../apps/docs/content/runtime.md) | installing plugins without a rebuild |
| [Publishing](../../apps/docs/content/publishing.md) | naming a package, and serving one to others |
| [Hosting](../../apps/docs/content/host.md) | mounting `PluginHost` in an app of your own |
| [pi compatibility](../../apps/docs/content/pi-compat.md) | what is inherited, degraded, omitted and added |

## Test

```sh
bun test
```

Every example under `examples/` is executed by the suite, and the snippet above is
asserted to match its file verbatim — so it cannot rot into something that no longer runs.
