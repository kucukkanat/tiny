# tiny

A chat client that runs entirely in the browser. Point it at any OpenAI- or
Anthropic-compatible endpoint, pick a model, and talk. Keys and chats live in
`localStorage` — there is no server.

Installable as a PWA, built for a phone first.

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run build
```

## Layout

| Package | Does |
| --- | --- |
| [`packages/app`](packages/app) | The shell: routing, layout, plugin host. Nothing else. |
| [`packages/ui`](packages/ui) | Beautiful UI primitives and the design tokens behind them. |
| [`packages/store`](packages/store) | A JSON value in `localStorage`, readable as a React store. |
| [`packages/llm`](packages/llm) | Provider config, and streaming chat through the Vercel AI SDK. |
| [`packages/plugin-chat`](packages/plugin-chat) | The chat screen and the chat list in the sidebar. |
| [`packages/plugin-settings`](packages/plugin-settings) | The provider settings screen. |

Every feature is a plugin. The shell contributes routes and a sidebar column and
stops there — see [`packages/app/src/plugins.ts`](packages/app/src/plugins.ts)
for the whole extension surface.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages
(`.github/workflows/pages.yml`). It needs one setting flipped once:
**Settings → Pages → Source → GitHub Actions**.

The build uses a relative base, so it works from a project path
(`user.github.io/tiny/`) or a domain root without changing anything. Routing is
hash-based, so deep links survive a hard refresh with no server rewrite rules.

## First run

Open **Settings → Add provider**, paste a base URL and an API key, press **Load
models**, pick one. The key is sent to that provider and nowhere else.

Anthropic's API rejects browser requests unless the caller opts in, so
`@tiny/llm` sends `anthropic-dangerous-direct-browser-access`. Your key is in a
browser either way — treat it accordingly.

The design language is [Beautiful UI](https://beautifului.dev) (MIT).
