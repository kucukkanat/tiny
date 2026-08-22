# tiny

[kucukkanat.github.io/tiny](https://kucukkanat.github.io/tiny/)

A browser-only PWA. A thin shell that routes, lays out, and hosts plugins —
every feature is a plugin.

```sh
bun install
bun dev        # vite dev server
bun test       # unit tests
bun typecheck
bun lint
bun run build  # static files in packages/app/dist
```

## Packages

| Package                 | What it is                                          |
| ----------------------- | --------------------------------------------------- |
| `@tiny/app`             | The shell: routing, layout, plugin list             |
| `@tiny/ui`              | Design tokens and components (shadcn + AI Elements) |
| `@tiny/plugin-host`     | The `Plugin` contract, and nothing else             |
| `@tiny/plugin-chat`     | Chat and its history, straight from the tab         |
| `@tiny/plugin-settings` | Model endpoint, API key and theme, kept on device   |

## Look

Dark first, light on request, switched in Settings. Tokens are Tailwind v4
`@theme` properties in `@tiny/ui` — one file to restyle the lot.

## Deploying

Push to `main`. `.github/workflows/pages.yml` typechecks, lints, tests, builds,
and publishes `packages/app/dist` to GitHub Pages.

It works under `/tiny/` because every path the build emits is relative and
routing is hash-based — no server rewrite, no `base` to keep in sync.

## Adding a feature

It's a plugin. Make `packages/plugin-<name>`, export a `Plugin`, add it to
`packages/app/src/plugins.ts`. The shell doesn't change.
