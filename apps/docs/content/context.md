# The context object

`ctx` is how a plugin reaches the running app: the conversation, the user, its own
storage. Every command handler and shortcut handler is given one, and a component
in a [slot](slots.md) asks for one with `usePluginContext()`.

```ts
import { usePluginContext } from "@tiny/plugin";

function MyButton() {
  const ctx = usePluginContext();
  return <button onClick={() => void ctx.runCommand("prompts")}>Prompts</button>;
}
```

The context you get is **namespaced to your plugin** — the same object your
commands receive, with your storage prefix and your error attribution.

## Shape

```ts
type PluginContext = {
  readonly ui: PluginUIContext;
  readonly mode: "react";
  readonly hasUI: true;
  readonly signal: AbortSignal | undefined;
  readonly chat: PluginChat;
  readonly settings: PluginSettings | undefined;
  updateSettings(next: PluginSettings): void;
  navigate(path: string): void;
  readonly storage: PluginStorage;
  runCommand(name: string, args?: string): Promise<void>;
  readonly commands: readonly CommandInfo[];
  abort(): void;
  isIdle(): boolean;
  hasPendingMessages(): boolean;
  getContextUsage(): ContextUsage;
  newSession(): void;
  reload(): Promise<void>;
};
```

`mode` is a new member of pi's `"tui" | "rpc" | "json" | "print"` union, so an
existing `ctx.mode === "tui"` guard in a ported extension stays false rather than
accidentally passing. `hasUI` is `true`, as it is in pi's RPC mode — dialogs work.

## Dialogs

Four, all `async`, all pi's signatures.

| Call | Resolves to | On dismissal |
| --- | --- | --- |
| `ui.select(title, options, opts?)` | the chosen string | `undefined` |
| `ui.confirm(title, message, opts?)` | `boolean` | `false` |
| `ui.input(title, placeholder?, opts?)` | the typed string | `undefined` |
| `ui.editor(title, prefill?)` | the edited text | `undefined` |

`opts` is `{ timeout?: number, signal?: AbortSignal }` — the same three ways a
dialog can end that pi documents, resolving to the fallback above when it is not
the user who ended it. `editor` takes no options, because pi's does not.

```ts
const ok = await ctx.ui.confirm("Clear chat?", "This conversation will be left behind.");
if (ok) ctx.navigate("/");
```

Dialogs queue. Opening a second one while the first is up is safe; they resolve
in order.

## Telling the user something

| Call | Effect |
| --- | --- |
| `ui.notify(message, type?)` | a toast; `type` is `"info" \| "warning" \| "error"`, auto-dismissed after 4s |
| `ui.setStatus(key, text)` | a persistent entry in the status bar; `undefined` removes it |
| `ui.setWidget(key, lines, opts?)` | a block of plain text lines above or below the editor; `undefined` removes it |
| `ui.setTitle(title)` | sets `document.title` |

`setWidget` carries `string[]` and nothing else. That is not a simplification —
it is the entire payload pi's RPC protocol defines for a widget, so anything a
portable extension can draw with, it can draw with here.

```ts
ctx.ui.setWidget("tokens", [`${total} tokens this session`], { placement: "aboveEditor" });
ctx.ui.setWidget("tokens", undefined); // gone
```

Placement is `"aboveEditor"` (the default) or `"belowEditor"`. The app decides
where those regions actually are by rendering `<Widgets placement="…" />`.

## Driving the composer

```ts
ctx.ui.setEditorText("Rewrite this more concisely.");  // replace the draft
ctx.ui.pasteToEditor(" — and cite sources.");          // append to it
```

`ui.getEditorText()` returns `""`. It is one of the
[terminal-only methods](pi-compat.md#degraded) kept present so a ported extension
degrades instead of throwing — the composer's text lives in the app, and pushing
into it is portable while reading out of it was never part of the RPC surface.

## A React modal

`ui.open` is ours; pi has no portable equivalent. It renders a component as an
overlay and resolves when that component calls `done`:

```tsx
const picked = await ctx.ui.open<string>((done) => (
  <div className="p-4">
    <button onClick={() => done("left")}>Left</button>
    <button onClick={() => done("right")}>Right</button>
  </div>
));
// `picked` is "left", "right", or undefined if the overlay was dismissed
```

Use it for a one-shot interaction. For UI that is always present, use
[`contribute`](slots.md) instead.

## The conversation

```ts
ctx.chat.messages   // readonly PluginMessage[] — role, content, reasoning
ctx.chat.streaming  // { text, reasoning, reasoningSeconds } while a reply arrives, else undefined
ctx.chat.send(text) // send a message as the user
ctx.chat.stop()     // abort the in-flight reply
```

`ctx.signal` is the `AbortSignal` of the request in flight, or `undefined` when
none is. Pass it to your own `fetch` so your work is cancelled with the turn.

## Settings and navigation

```ts
ctx.settings          // { baseUrl, apiKey, model } | undefined
ctx.updateSettings({ ...ctx.settings, model: "gpt-4o-mini" });
ctx.navigate("/c/abc123");  // hash routes: "/" is a new conversation
```

`ctx.settings` includes the user's API key, because a plugin that talks to the
same endpoint needs it. That is a real capability, and it is one of the reasons
[installing a runtime plugin is a trust decision](runtime.md#the-trust-boundary).

`settings.providerId` names the [registered provider](providers.md) the selected
model came from; absent means the user's own endpoint. If you are adding a
provider, pass its key as a thunk rather than a string — a key in the config sits
in the registry, where this very object would hand it to every other plugin.

## Storage

```ts
ctx.storage.get<string[]>("saved");   // T | undefined
ctx.storage.set("saved", [...saved, text]);
ctx.storage.remove("saved");
```

JSON-serialised into `localStorage` under `tiny-plugin:<pluginId>:<key>`, so
nothing you write can collide with the app's keys or another plugin's. A value
that fails to parse reads back as `undefined` rather than throwing.

The `pluginId` half of that prefix is your factory's function name — see
[plugin identity](anatomy.md#when-factories-run-and-what-identity-they-get) for
why an anonymous factory gets a positional id instead, and how to avoid it.

## Commands

```ts
ctx.commands                          // [{ name, description }] — every registered command
await ctx.runCommand("prompts");      // invoke one
await ctx.runCommand("greet", "you"); // with arguments
```

`runCommand` matches the invocation name first and the registered name second, so
it finds `review:2` and also plain `review`. An unknown name logs and resolves;
it does not throw.

## Idle, abort and usage

pi's questions about the turn in flight, with pi's names.

```ts
ctx.isIdle();              // false while a reply is streaming
ctx.hasPendingMessages();  // the same question from the other side
ctx.abort();               // stop the reply — the same as ctx.chat.stop()
ctx.newSession();          // start a fresh conversation
ctx.getContextUsage();     // { input, output, totalTokens, contextWindow }
```

There is no queue here — a reply is either streaming or it is not — so `isIdle`
and `hasPendingMessages` are exact opposites rather than two different questions.

`getContextUsage()` reports the last completed turn. **`contextWindow` is `0`**
unless the endpoint publishes one: a bring-your-own OpenAI-compatible server
advertises nothing but model ids, so `@tiny/ai` fills its model descriptor with
placeholders. The same is true of cost. See
[what a provider could supply instead](providers.md#what-does-not-port-from-pi).

## reload

```ts
await ctx.reload();
```

Re-runs every plugin factory and rebuilds the registry, resolving once the new one
is live. pi has no equivalent because pi discovers extensions from disk at
startup and this host does not.

It resolves when the attempt is *over*, not when it succeeded — a factory that
throws still ends the wait, with the failure logged.

This is the mechanism the [plugin manager](runtime.md) applies every change with,
and it is [how a plugin gets unloaded](runtime.md#reloading-is-how-unloading-works).

## The theme object

`ctx.ui.theme` exists and every method is the identity function:

```ts
ctx.ui.theme.fg("accent", "●"); // "●"
```

pi extensions call this inline while building strings. A browser has no ANSI, so
returning the string unstyled is the honest degradation — the alternative is a
crash halfway through a template literal. The full list of what degrades and to
what is on the [pi compatibility](pi-compat.md) page.
