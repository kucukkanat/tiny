# @tiny/app

The shell. Routing (`HashRouter`), layout, and the list of what ships. Nothing
else belongs here.

```sh
bun dev      # from the repo root
bun run build
```

Shipping an extension in the build is one line in `src/extensions.tsx`:

```ts
export const BUNDLED = [
  chat,
  settings,
  manager,
] as const satisfies readonly ExtensionModule[]
```

`app.tsx` hands that list to the registry with `attach(tiny, BUNDLED)`, which is
also the only thing that evaluates `extensions.tsx` — drop the import and the app
comes up with no routes at all. Home is the first screen that is actually live,
not a constant: what ships can be switched off in Extensions, and redirecting to
a route that no longer exists would put the catch-all in a loop.

## Layout

A left sidebar and the screen beside it. On a phone the sidebar is a drawer
behind the toggle in the top bar; on a wider screen it sits there and collapses.

The shell reads two slots off every live extension, whatever its origin:

- `Screen`, rendered under `/#/<id>` — anything below that is its own routing,
  which is how chat gets `/#/chat/:id`
- `Sidebar`, optional, rendered in the sidebar body

One that doesn't fill the sidebar gets a link in its footer instead; one with a
section up there is already reachable from it. That's why chat's conversations
are in the body and settings is at the bottom.

## Theme

Dark unless `localStorage` says otherwise. `index.html` ships `class="dark"` so
the first paint is dark, and `main.tsx` applies a stored choice over the top.
The switch is in Settings; the tokens are in `@tiny/ui`.
