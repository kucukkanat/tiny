# tiny

A minimal, installable **PWA chat client** for any OpenAI-compatible AI endpoint,
built on [Beautiful UI](https://www.beautifului.dev/) primitives. Everything runs
in the browser — you bring a base URL and an API key; nothing is proxied through
a server.

**[Documentation](https://kucukkanat.github.io/tiny/)** ·
**[Live app](https://kucukkanat.github.io/tiny/app/)**

Tiny is extended by **plugins**: commands, shortcuts, tools for the model and
React rendered into named slots — shaped after pi's extension SDK. Plugins can
ship in the build or be [installed at runtime](https://kucukkanat.github.io/tiny/runtime/)
from a URL or pasted source, with no rebuild and no page reload.

## Packages

| Package | What it is |
| --- | --- |
| [`apps/chat`](apps/chat) (`@tiny/chat`) | The PWA: hash-routed React app, IndexedDB chat history, streaming replies with a thinking trace, model picker. |
| [`packages/ai`](packages/ai) (`@tiny/ai`) | Typed streaming client for OpenAI-compatible endpoints (reasoning deltas, model listing), on the [pi](https://pi.dev) LLM harness. |
| [`packages/plugin`](packages/plugin) (`@tiny/plugin`) | Plugin host — tools, commands, shortcuts, dialogs and render slots — shaped after pi's extension SDK, so a pi extension using only RPC-portable methods runs unmodified. |
| [`packages/plugin-fs`](packages/plugin-fs) (`@tiny/plugin-fs`) | Filesystem tools for the model (`fs_read`, `fs_write`, `fs_edit`, `fs_delete`, `fs_list`), backed by the browser's Origin Private File System. |
| [`packages/plugin-hitl`](packages/plugin-hitl) (`@tiny/plugin-hitl`) | Human in the loop — the model asks, the user answers. Built on pi's `tool_call` event, so a refusal steers the model rather than ending the turn. |
| [`packages/plugin-manager`](packages/plugin-manager) (`@tiny/plugin-manager`) | Install plugins at runtime from a URL or pasted source — stored in OPFS, pinned by SHA-256, managed from a dialog in the app. |
| [`packages/ui`](packages/ui) (`@tiny/ui`) | Beautiful UI primitives adapted for this app, plus their design tokens. |
| [`apps/docs`](apps/docs) (`@tiny/docs`) | The plugin documentation site — markdown in, static site out, on the same Bun toolchain. |

Plugin packages are named `@tiny/plugin-<name>` in this repo, and `tiny-plugin-<name>` (or
`@<vendor>/tiny-plugin-<name>`) when published by someone else — so `tiny-plugin-` appears
in every plugin's name and nowhere else. See
[`packages/plugin`](packages/plugin/README.md#naming-an-extension-package).

## Quick start

```sh
bun install
bun run dev        # dev server with HMR
bun run build      # static build → apps/chat/dist
bun run docs       # build the docs site and serve it on :4321
bun run build:site # docs at / and the app at /app/ → dist (what Pages serves)
bun run mock       # a local endpoint that always calls a tool, on :8787
bun run test       # unit + integration tests
bun run lint       # biome
bun run typecheck  # tsc, strict
```

Open the app, click the settings gear, enter your endpoint's base URL
(e.g. `https://api.openai.com/v1`, `http://localhost:11434/v1` for Ollama),
your API key, and pick a model. The key is stored in `localStorage` on your
device only and is sent only to the base URL you configured.

## Stack

Bun (runtime, bundler, test runner) · React 19 · TypeScript strict · Tailwind 4 ·
[pi-ai](https://github.com/earendil-works/pi) (LLM harness) · react-router (hash
routing) · idb-keyval · Biome.
