# tiny

[kucukkanat.github.io/tiny](https://kucukkanat.github.io/tiny/)

A browser-only PWA. A thin shell that routes, lays out, and hosts features.
Features come two ways: **plugins** are built in, **extensions** are installed
into the running app from a URL.

```sh
bun install
bun dev        # vite dev server
bun test       # unit tests
bun typecheck
bun lint
bun run build  # static files in packages/app/dist
```

## Packages

| Package                   | What it is                                              |
| ------------------------- | ------------------------------------------------------- |
| `@tiny/app`               | The shell: routing, layout, plugin list                 |
| `@tiny/ui`                | Design tokens and components (shadcn + AI Elements)     |
| `@tiny/plugin-host`       | The `Plugin` and `Extension` contracts, and little else |
| `@tiny/plugin-chat`       | Chat and its history, straight from the tab             |
| `@tiny/plugin-settings`   | Model endpoint, API key and theme, kept on device       |
| `@tiny/plugin-extensions` | Extensions you install into the running app             |
| `@tiny/extension-starter` | A working extension, and the one to copy                |

## Look

Dark first, light on request, switched in Settings. Tokens are Tailwind v4
`@theme` properties in `@tiny/ui` — one file to restyle the lot.

## Deploying

Push to `main`. `.github/workflows/pages.yml` typechecks, lints, tests, builds,
and publishes `packages/app/dist` to GitHub Pages.

It works under `/tiny/` because every path the build emits is relative and
routing is hash-based — no server rewrite, no `base` to keep in sync.

## Adding a feature

Two ways, and the difference is when.

**A plugin** is built in. Make `packages/plugin-<name>`, export a `Plugin`, add
it to `packages/app/src/plugins.tsx`. The shell doesn't change. It ships when you
deploy.

**An extension** is installed by whoever is using the app, and is live in the
next message. No build, no deploy. It can register tools for the model, add a
screen and a sidebar section, register a model provider, read past conversations,
add an action to a highlighted reply, and bring its own styles. Tools are
extensions too — it is the only way to give the model one.

Four ways in, on the Extensions screen: paste a URL, pick a file, start from one
of three premades and edit it, or write one from scratch. The last three are
kept as text and run from it, so they work offline and survive a reload.

```tsx
import type { Extension, Tiny } from '@tiny/plugin-host'
import { tool } from 'ai'
import { z } from 'zod'

export default (tiny: Tiny): Extension => ({
  id: 'dice',
  title: 'Dice',
  tools: {
    roll: tool({
      description: 'Roll an n-sided die.',
      inputSchema: z.object({ sides: z.number() }),
      execute: ({ sides }) => 1 + Math.floor(Math.random() * sides),
    }),
  },
})
```

`packages/extension-starter` is a real one using every slot, and it ships with
the app — open Extensions and press "Try the example one". Its README is the
guide: what you may import, how to run one against `bun dev`, how to publish it,
and what each failure means.

An extension runs in the page with the API key in reach, so the screen shows what
one registers before you turn it on, and an install link never turns itself on.
There is no sandbox; treat one the way you'd treat anything else you run on your
own machine.
