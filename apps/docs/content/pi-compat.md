# pi compatibility

`@tiny/plugin` is shaped after **pi's extension SDK**
([`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi), see its
`docs/extensions.md`). This page is the honest accounting of what that means, so
nothing here is mistaken for full SDK conformance.

**A pi extension that touches only RPC-portable methods runs here unmodified.**

## Why a terminal API works in a browser

pi's extension UI is already renderer-agnostic, because pi runs extensions against
a non-terminal frontend in **RPC mode**. `ctx.mode` is
`"tui" | "rpc" | "json" | "print"`, `ctx.hasUI` is true in both TUI *and* RPC, and
pi's `docs/rpc.md` §"Extension UI Protocol" documents exactly which `ctx.ui`
methods survive that transition.

The rule is mechanical:

> **If a signature mentions `tui`, `theme`, or a `(tui, theme) => Component`
> factory, it does not port.**

Everything else is pure intent — "ask the user to pick one of these" — and renders
as a React modal as readily as a TUI dialog. This package is, in effect, a fourth
`ctx.mode`, and it reports itself as one:

```ts
ctx.mode === "react"   // so a pi extension's `ctx.mode === "tui"` guard stays false
ctx.hasUI === true     // dialogs work, as in RPC
```

`"react"` is a new member of the union rather than a lie about being `"rpc"`,
because an extension is entitled to know what it is talking to.

## Inherited verbatim

Same names, argument order and return values.

| | |
| --- | --- |
| `pi.on(event, handler)` | for the five events below |
| `pi.registerCommand(name, { description, getArgumentCompletions, handler })` | `handler(args, ctx)` |
| `pi.registerShortcut(key, { description, handler })` | pi's `KeyId` format; modifiers are `ctrl` / `shift` / `alt` / `super` |
| `pi.registerTool(tool)` | pi's shape, with `parameters` as plain JSON Schema |
| `ctx.ui.select / confirm / input` | including `{ timeout, signal }` and pi's dismissal values |
| `ctx.ui.editor(title, prefill)` | pi takes no options here, so neither do we |
| `ctx.ui.notify / setStatus / setWidget / setTitle / setEditorText / pasteToEditor` | fire-and-forget |
| `ctx.mode`, `ctx.hasUI`, `ctx.signal` | `mode` is `"react"` |

## Events

Five fire, because five are all `@tiny/ai` emits: `before_agent_start`,
`context`, `message_start`, `message_update`, `message_end`.

**Every other pi event name is accepted without error and never fires.** A pi
extension that subscribes to `session_start`, `tool_call` or `turn_end` loads
cleanly and simply never hears from them — which is the difference between "runs
unmodified" and "compiles unmodified".

## Degraded

Present, never throwing, returning exactly what pi's RPC mode returns. A ported
extension degrades here precisely as it would over RPC.

| Method | Returns |
| --- | --- |
| `custom()` | `undefined` |
| `getEditorText()` | `""` |
| `getToolsExpanded()` | `false` |
| `getAllThemes()` | `[]` |
| `getTheme()` | `undefined` |
| `setTheme()` | `{ success: false, error }` |
| `getEditorComponent()` | `undefined` |
| `onTerminalInput()` | a no-op unsubscribe function |
| `setWorkingMessage`, `setWorkingVisible`, `setWorkingIndicator`, `setHiddenThinkingLabel`, `setFooter`, `setHeader`, `setEditorComponent`, `setToolsExpanded`, `addAutocompleteProvider` | no-op |
| `ctx.ui.theme` | every method is the identity, so `theme.fg("accent", "●")` yields `"●"` rather than throwing |

## Omitted

No analogue in a browser chat, so they are absent rather than faked.

| pi has | Why not here |
| --- | --- |
| `registerProvider`, `registerFlag` | no provider registry and no CLI |
| `registerMessageRenderer`, `registerEntryRenderer` | they return `pi-tui` components; the concept ports, the signature does not |
| `ctx.sessionManager`, `ctx.cwd`, `ctx.modelRegistry` | no session store, filesystem or provider registry |
| `pi.sendMessage`, `pi.appendEntry`, `pi.exec` | no session entries and no shell |
| Auto-discovery from `~/.pi/agent/extensions/` | plugins are listed in the app's registry, or [installed at runtime](runtime.md) |

## Added

No pi equivalent.

| | |
| --- | --- |
| `pi.contribute(slot, Component)` | [React components into named regions](slots.md) |
| `ctx.ui.open(render)` | a React component as a modal, resolving when it closes |
| `ctx.reload()` | [re-run every factory and rebuild the registry](runtime.md#reloading-is-how-unloading-works) |
| `ctx.chat`, `ctx.settings`, `ctx.updateSettings`, `ctx.navigate`, `ctx.storage`, `ctx.runCommand`, `ctx.commands` | the app's own state and actions |

`ctx.reload()` exists because pi discovers extensions from disk at startup and
this host does not: a plugin that installs other plugins needs a way to apply the
change without a page reload.

## One deliberate behavioural difference

**`@tiny/ai` catches nothing, and this package catches deliberately.**

That is right for a request and wrong for a render — one throwing component would
blank the app — so every contribution is wrapped in an
[error boundary](slots.md#errors), and a throwing command handler is reported
through `ctx.ui.notify` rather than propagating.

## Porting checklist

Bringing an extension over from `.pi/extensions/`:

1. Does it call anything whose signature mentions `tui`, `theme` or a component
   factory? Those calls become no-ops. Replace them with
   [`contribute`](slots.md) or [`ui.open`](context.md#a-react-modal) if the UI
   matters.
2. Does it read `ctx.ui.getEditorText()`? That returns `""`. Pushing text in is
   portable; reading it out was never in the RPC surface.
3. Does it branch on `ctx.mode`? `"react"` is a new member of the union, so a
   `=== "tui"` guard stays false, and an `!== "tui"` guard now passes. Check the
   latter.
4. Does it use `ctx.sessionManager`, `ctx.cwd`, `pi.exec` or `pi.sendMessage`?
   Those are absent, not degraded — the extension will not run as-is.
5. Does it rely on events other than the five above? They will never fire.

Everything else should run untouched.
