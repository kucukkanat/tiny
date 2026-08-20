# pi compatibility

`@tiny/plugin` is shaped after **pi's extension SDK**
([`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi), see its
`packages/coding-agent/docs/extensions.md`). This page is the honest accounting
of what that means, so nothing here is mistaken for full SDK conformance.

**A pi extension that touches only RPC-portable methods runs here unmodified.**

## Coverage at a glance

Counted against pi's documented surface.

| Area | pi | Here |
| --- | --- | --- |
| `ctx.ui.*` | 28 methods | all 28 — 11 functional, 17 degraded as RPC degrades them — plus `open()` |
| Events for `pi.on` | 34 | all 34 accepted; 6 fire |
| `pi.*` methods | 26 | 15, plus `contribute()`, `registerPanel()`, `registerRoute()` |
| `ExtensionContext` | 18 members | 9, plus 7 of the app's own |
| `ExtensionCommandContext` extras | 7 | `reload()` |

## Why a terminal API works in a browser

pi's extension UI is already renderer-agnostic, because pi runs extensions
against a non-terminal frontend in **RPC mode**. `ctx.mode` is
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
| `pi.on(event, handler)` | for the six events that fire, `tool_call` included |
| `pi.registerCommand(name, { description, getArgumentCompletions, handler })` | `handler(args, ctx)` |
| `pi.registerShortcut(key, { description, handler })` | pi's `KeyId` format; modifiers are `ctrl` / `shift` / `alt` / `super` |
| `pi.registerTool(tool)` | pi's positional `execute` and content-block result — see [Tools](tools.md) |
| `pi.getCommands()` | extension commands, in invocation order |
| `pi.registerMarkdownTransformer(fn)` | chained in load order, each seeing the last one's output |
| `pi.events` | the shared bus — `on` / `once` / `off` / `emit` |
| `pi.getAllTools()` / `getActiveTools()` / `setActiveTools(names)` | over the registry's tools |
| `pi.setModel(model)` | writes through to the app's settings |
| `pi.sendUserMessage(content)` | sends as the user |
| `pi.setSessionName(name)` / `getSessionName()` | the conversation's title |
| `ctx.ui.select / confirm / input` | including `{ timeout, signal }` and pi's dismissal values |
| `ctx.ui.editor(title, prefill)` | pi takes no options here, so neither do we |
| `ctx.ui.notify / setStatus / setWidget / setTitle / setEditorText / pasteToEditor` | fire-and-forget |
| `ctx.ui.getEditorText()` | the composer's draft, including what the user typed — this host owns it |
| `ctx.mode`, `ctx.hasUI`, `ctx.signal` | `mode` is `"react"` |
| `ctx.abort()`, `ctx.isIdle()`, `ctx.hasPendingMessages()` | one reply at a time, so the last two are opposites |
| `ctx.getContextUsage()` | tokens for the turn |
| `ctx.newSession()` | starts a fresh conversation |
| `ctx.reload()` | pi's `/reload` flow, over plugin factories rather than files on disk |

`ctx.reload()` is worth naming explicitly because it is easy to assume otherwise:
it is **pi's**, adapted, not an invention here. pi reloads extensions, skills,
prompts and themes from disk; this re-runs every plugin factory and rebuilds the
registry. Both resolve once the new runtime is live, and in both, a plugin that no
longer registers is gone. See
[reloading](runtime.md#reloading-is-how-unloading-works).

## Events

Six fire, because six are all `@tiny/ai` emits: `before_agent_start`, `context`,
`message_start`, `message_update`, `message_end` and `tool_call`.

`tool_call` is the one that can change what happens. It fires between preparing a
tool's arguments and running it, `event.input` is mutable so a handler can patch
the arguments in place, and returning `{ block: true, reason }` stops the call —
feeding the reason back as the tool's result, so the model reads it and carries
on. pi's semantics exactly, including that the first handler to block
short-circuits the rest. See [Approvals](tools.md#approvals-are-just-an-event).

Handlers receive the same context commands do — `ctx.ui`, `ctx.hasUI`,
`ctx.storage` — widened with the request's own `model` and `signal`. That is what
lets pi's shipped permission gates run here unedited.

**Every other pi event name is accepted without error and never fires.** A pi
extension that subscribes to `session_start`, `turn_end` or
`session_compact_failed` loads cleanly and simply never hears from them — which is
the difference between "runs unmodified" and "compiles unmodified".

## Degraded

Present, never throwing, returning exactly what pi's RPC mode returns. A ported
extension degrades here precisely as it would over RPC.

| Method | Returns |
| --- | --- |
| `custom()` | `undefined` |
| `getToolsExpanded()` | `false` |
| `getAllThemes()` | `[]` |
| `getTheme()` | `undefined` |
| `setTheme()` | `{ success: false, error }` |
| `getEditorComponent()` | `undefined` |
| `onTerminalInput()` | a no-op unsubscribe function |
| `setWorkingMessage`, `setWorkingVisible`, `setWorkingIndicator`, `setHiddenThinkingLabel`, `setFooter`, `setHeader`, `setEditorComponent`, `setToolsExpanded`, `addAutocompleteProvider` | no-op |
| `ctx.ui.theme` | every method is the identity, so `theme.fg("accent", "●")` yields `"●"` rather than throwing |

## Reduced

pi's name and intent, with less behind them. Worth reading before assuming a
straight port.

| | What survives |
| --- | --- |
| `pi.registerProvider(id, config)` | base URL, authentication, api type and a model list — including pi's per-model `api` override. Six of pi's nine api types work in a browser; `openai-codex-responses`, `google-vertex` and `bedrock-converse-stream` cannot. pi's credential store, generation-checked catalog persistence and native `pi-ai` `Provider` have nowhere to live — see [Providers](providers.md) |
| `pi.registerMarkdownTransformer(fn)` | the transformer's context has `messageType` and `isStreaming`, but not pi's `availableWidth`: a browser has no column count |
| `pi.sendUserMessage(content)` | the message is sent; pi's `{ deliverAs: "followUp" }` has no queue to deliver into |
| `ctx.ui.pasteToEditor(text)` | appends rather than inserting at a cursor with collapse handling. pi's RPC mode degrades this further, to a plain replace |

## Omitted

No analogue in a browser chat, so they are absent rather than faked.

| pi has | Why not here |
| --- | --- |
| `registerFlag`, `getFlag` | no CLI to parse flags from |
| `exec` | no shell in a browser |
| `sendMessage`, `appendEntry`, `setLabel` | no session entries to append or label |
| `registerMessageRenderer`, `registerEntryRenderer` | they return `pi-tui` components; the concept ports, the signature does not |
| `getThinkingLevel`, `setThinkingLevel`, `ctx.scopedModels` | no thinking-level or scoped-model concept behind a bare endpoint |
| `ctx.sessionManager`, `ctx.cwd`, `ctx.modelRegistry`, `ctx.model` | no session store, filesystem or pi-ai model registry |
| `ctx.compact()`, `waitForIdle()`, `fork()`, `navigateTree()`, `switchSession()`, `shutdown()`, `isProjectTrusted()`, `getSystemPrompt()` | no compaction, session tree or project trust here |
| Auto-discovery from `~/.pi/agent/extensions/` | plugins are listed in the app's registry, or [installed at runtime](runtime.md) |

## Added

No pi equivalent.

| | |
| --- | --- |
| `pi.contribute(slot, Component)` | [React components into named regions](slots.md) |
| `pi.registerPanel(id, opts)` | [a panel in the right-hand rail](panels.md), which no rail exists without |
| `pi.registerRoute(path, opts)` | [a page of the plugin's own](panels.md#pages), at an address |
| `ctx.ui.open(render)` | a React component as a modal, resolving when it closes |
| `ctx.chat`, `ctx.settings`, `ctx.updateSettings`, `ctx.navigate`, `ctx.storage`, `ctx.runCommand`, `ctx.commands` | the app's own state and actions |

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
   matters, [`registerPanel`](panels.md) if it wants a region of its own, or
   [`registerRoute`](panels.md#pages) if it wants a whole screen.
2. Does it branch on `ctx.mode`? `"react"` is a new member of the union, so a
   `=== "tui"` guard stays false, and an `!== "tui"` guard now passes. Check the
   latter.
3. Does it use `ctx.sessionManager`, `ctx.cwd`, `pi.exec`, `pi.appendEntry` or
   `pi.registerFlag`? Those are absent, not degraded — the extension will not run
   as-is.
4. Does it call `pi.registerProvider` with credential storage, `refreshModels`
   persistence or a native `pi-ai` `Provider`? Only the base-URL-and-models part
   is honoured. See [Providers](providers.md).
6. Does it rely on events other than the six above? They will never fire.

Everything else should run untouched.
