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
      // Optional: `tiny.getSessionName` / `setSessionName` report they are
      // unsupported when a host has no named sessions.
      sessionName,
      setSessionName,
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
const chat = useChat({
  conversationId: id,
  endpoint,
  model,
  onConversationCreated: (createdId) => navigate(`/c/${createdId}`),
});

// Right.
const onCreated = useCallback((createdId: string) => navigate(`/c/${createdId}`), [navigate]);
const chat = useChat({ conversationId: id, endpoint, model, onConversationCreated });
```

Watch for callbacks that get folded into others. An inline `onConversationCreated`
gives `useChat`'s `send` a new identity every render, and `send` is on the bridge.

## Render the slots

```tsx
import { Slot, StatusBar, Widgets } from "@tiny/plugin";

<Sidebar footer={<Slot name="sidebar.footer" />} />

<Widgets placement="aboveEditor" />
<PromptBar
  actions={<Slot name="composer.actions" />}
  text={editorText}
  onTextChange={setEditorText}
/>
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

## Panels and pages

[Panels](panels.md) need one component, placed wherever a right-hand rail belongs:

```tsx
import { Panels } from "@tiny/plugin";

<div className="flex h-full">
  <YourSidebar />
  <YourMain />
  <Panels />          {/* renders nothing until a plugin registers a panel */}
</div>
```

`<Panels />` owns the rail's chrome — the tab strip, the collapse toggle, and
remembering which panel was open — so there is nothing to wire but the placement.
It renders `null` while no plugin has registered a panel, which is what keeps the
rail out of an app that has no use for one.

Pages are the one surface that needs *you*, because this package ships no router
and should not pick yours. `usePluginRoutes()` gives you the entries; map them
onto whatever routing you already have, and render `<PluginPage>` as the element:

```tsx
import { PluginPage, usePluginRoutes } from "@tiny/plugin";

const pages = usePluginRoutes();

<Routes>
  <Route path="/" element={thread} />
  <Route path="/c/:id" element={thread} />
  {pages.map((entry) => (
    <Route key={entry.path} path={entry.path} element={<PluginPage entry={entry} />} />
  ))}
</Routes>;
```

**Declare your own routes first.** React Router breaks a tie in specificity by
declaration order, and that is the whole of what stops a plugin claiming a path
your app already owns. `registerRoute` canonicalises what it stores — collapsing
repeated slashes, dropping the trailing one — so a plugin cannot slip past that
tie by spelling your path more specifically.

**Wait for `ready` before rendering a fallback route.** Factories run in an
effect, so there is a window in which the registry is empty and no plugin page
exists yet. A catch-all that answers during that window confidently paints the
wrong screen at a bookmarked plugin URL:

```tsx
const { ready } = usePluginHost();

<Route path="*" element={ready ? thread : <main className="flex-1" />} />;
```

`ready` turns true when the factories have finished, however they finished — a
load that threw still counts, or the app would wait forever on plugins that are
never coming. A `reload()` leaves it true, because the previous registry stays
live until the new one lands.

An entry whose `options.label` is set is asking for a link in your navigation; one
without is reached some other way and should not be listed:

```tsx
const links = pages.flatMap(({ path, options: { label, icon } }) =>
  label === undefined ? [] : [{ id: path, label, ...(icon === undefined ? {} : { icon }) }],
);
```

## Hand the registry to your client

Two hooks return what plugins registered for the model:

```tsx
const chat = useChat({
  conversationId: id,
  endpoint,
  model,
  onConversationCreated,
  extensions: usePluginExtensions(),
  tools: usePluginTools(),
});
```

| Hook | Returns |
| --- | --- |
| `usePluginExtensions()` | the `@tiny/ai` extensions the registry collected |
| `usePluginTools()` | the `ToolDefinition[]` plugins registered, minus any `setActiveTools` switched off |
| `usePluginProviders()` | the endpoints registered with [`registerProvider`](providers.md) |
| `usePluginPanels()` | the [panels](panels.md) registered, in tab order — empty means no rail |
| `usePluginRoutes()` | the [pages](panels.md#pages) registered, for your router |
| `usePluginEvents()` | the bus behind `tiny.events` |
| `useMarkdown(text, context)` | that text after every registered transformer |
| `usePluginHost()` | the whole host value — `runCommand`, `editorText`, `setEditorText`, `commands`, `activeTools`, `ready`, the registry |

`usePluginHost()` gives you `editorText` and `setEditorText`. **Control your
composer with them** rather than keeping a draft of your own: they are what
`ui.setEditorText` and `ui.pasteToEditor` write, and what `ui.getEditorText()`
reads. A composer that holds its own state leaves `getEditorText()` blind to
everything the user typed.

## Loading plugins without React

`loadPlugins` is the whole registry builder and has no React in it, which is what
makes it testable and scriptable:

```ts
import { loadPlugins } from "@tiny/plugin";

const registry = await loadPlugins([fileSystem(), notion({ token })]);
registry.commands;      // [{ name, invocationName, pluginId, options }]
registry.tools;         // ToolDefinition[], duplicates dropped
registry.contributions; // [{ id, slot, pluginId, component }]
registry.panels;        // [{ id, panelId, pluginId, options }], in tab order
registry.routes;        // [{ path, pluginId, options }], first claim on a path wins
registry.markdown;      // [{ pluginId, transformer }], in load order
registry.providers;     // [{ id, pluginId, config }] — a snapshot, see below
registry.extensions;    // [Extension] — one, replaying every `on()` call
```

`loadPlugins` takes a second argument for the parts that outlive one load:

```ts
await loadPlugins(plugins, {
  providers,           // a ProviderStore, so late registrations survive
  events,              // the shared bus, so subscriptions survive a reload
  host: () => actions, // resolved per call, for tiny methods that drive the app
});
```

`registry.providers` is a **snapshot**, because pi allows `registerProvider` to be
called long after the factory returns. `PluginHost` subscribes to the store
instead and exposes the live list through `usePluginProviders()`; a bare
`loadPlugins` caller should hold the store itself.

`host` supplies what `tiny.getCommands`, `tiny.setModel`, `tiny.sendUserMessage`,
`tiny.setSessionName` and `tiny.get/setActiveTools` reach. Omit it and each reports
that no host is mounted rather than throwing, which is what makes `loadPlugins`
usable in a test or a script.

## Why `@tiny/ai` needed no change

`loadExtensions` builds its own `ExtensionAPI` internally, so it can never be
handed the richer `PluginAPI` object — and it does not need to be. The host
records every `on()` call while the factories run and replays them into whatever
API `streamChat` constructs:

```ts
const replay: Extension = (tiny) => {
  for (const [event, handler] of recorded) {
    const on = tiny.on as (event: string, handler: unknown) => void;
    // Events this facade never fires are dropped rather than registered, so a
    // pi extension subscribing to `session_start` loads without erroring.
    if (firesEvent(event)) on(event, handler);
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
| A contributed component, a panel or a page | replaced by a `<pluginId> failed` marker; the rest of the app renders |
| A command handler | logged, and surfaced as an error toast |
| A shortcut handler | logged |
| A plugin factory | `[plugin] failed to load` — the registry keeps its previous value |
| A runtime plugin's factory | logged by the manager; every other plugin still loads |

`reload()` resolves when the attempt is over, not when it succeeded.
