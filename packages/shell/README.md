# @tiny/shell

The assembled chat application, as a package — so an app is a plugin list and
one `render` call, and everything else arrives already wired.

```tsx
import { TinyApp } from "@tiny/shell";
import { createRoot } from "react-dom/client";
import { plugins } from "./plugins.ts";

createRoot(root).render(<TinyApp plugins={plugins} />);
```

`apps/chat` is exactly this and nothing more: its `src/` is `main.tsx`,
`plugins.ts` and a stylesheet.

## What it assembles

| Export | What it is |
| --- | --- |
| `TinyApp` | host + router + shell in one component — the baseplate |
| `ChatShell` | the chrome alone: sidebar, thread, composer, panels, routes. Mount it under your own `PluginHost` and router when you own either |
| `Thread` | the message list, with the `message.actions` and `message.pending` slots in place |
| `useChat` | one conversation: messages, the reply in flight, `send`/`stop` |
| `Settings`, `loadSettings`, `saveSettings`, `OWN_ENDPOINT` | the user's endpoint, persisted |
| `Conversation` helpers | the IndexedDB conversation store the sidebar lists |

Everything in here is glue an app used to write for itself — publishing the
bridge with `useProvideApp`, resolving providers into endpoints, handing the
registry's tools and extensions to `useChat`, holding the router's fallback
until the factories finish. None of it is privileged: it reaches plugins
through the same hooks any host would use, so `ChatShell.tsx` doubles as the
reference implementation for [hosting `@tiny/plugin` in an app of your
own](../../apps/docs/content/host.md).

## When not to use it

An app with its own chrome should skip this package and wire `PluginHost`
directly — the host page of the docs walks through exactly what `ChatShell`
does, part by part. This package is the standard assembly, not the only one.
