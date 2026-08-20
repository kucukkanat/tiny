# @tiny/chat

The Tiny Chat PWA — a minimal AI chat for any OpenAI-compatible endpoint.
Everything runs in the browser: your base URL + API key live in
`localStorage`, conversations in IndexedDB, and requests go straight from the
browser to the endpoint you configure.

## Run

```sh
bun run dev    # http://localhost:3000, HMR
bun run build  # static PWA → dist/
bun run test   # unit + integration tests (happy-dom, fake-indexeddb, real SSE server)
```

Serve `dist/` from any static host. The service worker caches the app shell for
offline start — network-first for the page, so a deploy is picked up rather than
pinned — and never caches API calls.

## Use

1. On first launch the settings dialog asks for a **base URL** (e.g.
   `https://api.openai.com/v1`, or `http://localhost:11434/v1` for Ollama) and
   an **API key**. Saving verifies the endpoint by listing its models.
2. Pick a model from the picker in the composer.
3. Chat. Reasoning models stream an expandable "Thinking" trace before the
   answer. Enter sends, Shift+Enter breaks the line, the send button becomes
   stop while a reply streams.

Conversations persist locally; switch or delete them from the sidebar
(`#/c/<id>` hash routes, so the build needs no server-side routing).

A plugin can add more than a button. `pi.registerPanel` opens a rail down the
right — absent entirely until some plugin asks for one — and `pi.registerRoute`
adds a page of its own at its own path, with the sidebar and rail still around it.
Neither needs a change here; see
[Panels and pages](../docs/content/panels.md).

## Structure

- `src/App.tsx` — the shell: sidebar, thread, composer, plugin slots, the
  right-hand rail, and the route table plugin pages are added to
- `src/Thread.tsx` — the transcript: messages, the reply in flight, tool lines
- `src/useChat.ts` — one conversation: streaming state machine and persistence
- `src/conversations.ts` — chat history, in IndexedDB
- `src/settings.ts` — the saved endpoint, key and model, in localStorage
- `src/plugins.ts` — the plugins the app runs; add one here.
  A plugin that only subscribes to events is an `@tiny/ai` extension (see
  "Extensions" in [`packages/ai`](../../packages/ai/README.md)); one that adds UI
  also registers commands, shortcuts or slots (see
  [`packages/plugin`](../../packages/plugin/README.md)). Settings ships as a
  plugin, which is what keeps the API honest, and
  [`@tiny/plugin-manager`](../../packages/plugin-manager/README.md) lets the user
  install more at runtime without a rebuild.
- `public/` — manifest, icon, service worker
