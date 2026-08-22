# @tiny/app

The shell. It does three things: routing, layout, and hosting plugins.

```bash
npm run dev -w @tiny/app
npm run build -w @tiny/app
```

## Plugins

`src/plugins.ts` is the entire extension surface:

```ts
export type Plugin = {
  id: string
  routes: { path: string; element: ReactNode }[]
  sidebar?: ComponentType
}
```

A plugin contributes routes and a slice of the sidebar column, in list order. To
add a feature, write a `plugin-<name>` package and add it to `plugins`. The shell
should not need to change.

## Routing

`HashRouter`, because the app is static files with no server to rewrite paths.
Everything worth keeping is in the URL or in `localStorage` — reload and nothing
the user cares about is gone.

## PWA

`vite-plugin-pwa` generates the manifest and service worker; `scripts/icon.py`
regenerates the icons.
