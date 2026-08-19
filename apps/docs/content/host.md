# Hosting the plugin system

`@tiny/plugin` is not tied to the Tiny chat app. If you have a React app and want
plugins in it, this is the wiring. There are three parts: mount the host, publish
your state into it, and render slots where contributions belong.

## Mount the host

```tsx
import { PluginHost } from "@tiny/plugin";

createRoot(root).render(
  <PluginHost plugins={plugins}>
    <App />
  </PluginHost>,
);
```

`PluginHost` owns everything plugins can drive: the registry, the dialog queue,
toasts, widgets, status entries and the composer's pushed text.

Factories run in an effect, so the registry arrives just after first paint. Your
app renders immediately and contributions appear when they are ready — an `async`
factory never blocks the first frame.

## Publish your state in

Chat state lives in your components, below the provider, so it is pushed **up**
rather than lifted:

```tsx
import { useProvideApp } from "@tiny/plugin";

useProvideApp(
  useMemo(
    () => ({
      messages: chat.messages,
      streaming: chat.streaming,
      settings,
      signal: undefined,
      send: (text: string) => void chat.send(text),
      stop: chat.stop,
      updateSettings,
      navigate: (path: string) => navigate(path),
    }),
    [chat.messages, chat.streaming, chat.send, chat.stop, settings, updateSettings, navigate],
  ),
);
```

That object becomes [`ctx.chat`, `ctx.settings`, `ctx.navigate`](context.md) and
the rest.

### Memoise it

**This is the one thing that will bite you.** The host stores the bridge as
state, so a field that gets a new identity on every render re-renders the host,
which re-renders you, forever.

The host defends what it can: `publish` skips the update when every field is
referentially unchanged, so rebuilding an identical wrapper object each render is
safe. What it cannot defend against is a field that genuinely changes:

```tsx
// Wrong — a new function every render.
send: (text) => chat.send(text),   // …if `chat.send` itself is unstable

// Wrong — the callback gets folded into `send`, so `send` is unstable too.
const chat = useChat(id, settings, (createdId) => navigate(`/c/${createdId}`));

// Right.
const onCreated = useCallback((createdId: string) => navigate(`/c/${createdId}`), [navigate]);
const chat = useChat(id, settings, onCreated);
```

Watch for callbacks that get folded into others. An inline `onConversationCreated`
gives `useChat`'s `send` a new identity every render, and `send` is on the bridge.

## Render the slots

```tsx
import { Slot, StatusBar, Widgets } from "@tiny/plugin";

<Sidebar footer={<Slot name="sidebar.footer" />} />

<Widgets placement="aboveEditor" />
<PromptBar actions={<Slot name="composer.actions" />} text={editorText} />
<Widgets placement="belowEditor" />
<StatusBar />

<Slot name="app.overlays" />
```

Inside the message list, `message.actions` gets the message it belongs to:

```tsx
<Slot name="message.actions" message={message} index={index} />
```

`<Slot>` renders nothing when no plugin has contributed to it, so every one of
these is safe to leave in place.

## Hand the registry to your client

Two hooks return what plugins registered for the model:

```tsx
const chat = useChat(id, settings, onCreated, usePluginExtensions(), usePluginTools());
```

| Hook | Returns |
| --- | --- |
| `usePluginExtensions()` | the `@tiny/ai` extensions the registry collected |
| `usePluginTools()` | the `ToolDefinition[]` plugins registered |
| `usePluginHost()` | the whole host value — `runCommand`, `editorText`, `commands`, the registry |

`usePluginHost().editorText` is what `ui.setEditorText` and `ui.pasteToEditor`
push at the composer; feed it into your input as a controlled value.

## Loading plugins without React

`loadPlugins` is the whole registry builder and has no React in it, which is what
makes it testable and scriptable:

```ts
import { loadPlugins } from "@tiny/plugin";

const registry = await loadPlugins([fileSystem(), notion({ token })]);
registry.commands;      // [{ name, invocationName, pluginId, options }]
registry.tools;         // ToolDefinition[], duplicates dropped
registry.contributions; // [{ id, slot, pluginId, component }]
registry.extensions;    // [Extension] — one, replaying every `on()` call
```

## Why `@tiny/ai` needed no change

`loadExtensions` builds its own `ExtensionAPI` internally, so it can never be
handed the richer `PluginAPI` object — and it does not need to be. The host
records every `on()` call while the factories run and replays them into whatever
API `streamChat` constructs:

```ts
const replay: Extension = (pi) => {
  for (const [event, handler] of recorded) {
    const on = pi.on as (event: string, handler: unknown) => void;
    // Events this facade never fires are dropped rather than registered, so a
    // pi extension subscribing to `session_start` loads without erroring.
    if (FIRED_EVENTS.has(event)) on(event, handler);
  }
};
```

Order is preserved, and replay is idempotent because `loadExtensions` builds fresh
handler arrays on every call. Registrations for events this host never fires are
dropped at replay time rather than at subscription time, which is what lets a real
pi extension subscribe to `session_start` and still load.

## What the host catches

`@tiny/ai` catches nothing by design. The host catches deliberately, because a
render is not a request:

| Throws in | Result |
| --- | --- |
| A contributed component | replaced by a `<pluginId> failed` marker; the rest of the app renders |
| A command handler | logged, and surfaced as an error toast |
| A shortcut handler | logged |
| A plugin factory | `[plugin] failed to load` — the registry keeps its previous value |
| A runtime plugin's factory | logged by the manager; every other plugin still loads |

`reload()` resolves when the attempt is over, not when it succeeded.
