# @tiny/app

The shell. Routing (`HashRouter`), layout, and the plugin list. Nothing else
belongs here.

```sh
bun dev      # from the repo root
bun run build
```

Registering a plugin is one line in `src/plugins.ts`:

```ts
export const plugins = [chat, settings] as const satisfies readonly Plugin[]
```

The first entry is home — unknown routes redirect there.

## Layout

A left sidebar and the screen beside it. On a phone the sidebar is a drawer
behind the toggle in the top bar; on a wider screen it sits there and collapses.

A plugin gets two slots:

- `Screen`, rendered under `/#/<id>` — anything below that is the plugin's own
  routing, which is how chat gets `/#/chat/:id`
- `Sidebar`, optional, rendered in the sidebar body

Plugins that don't fill the sidebar get a link in its footer instead; a plugin
with a section up there is already reachable from it. That's why chat's
conversations are in the body and settings is at the bottom.

## Theme

Dark unless `localStorage` says otherwise. `index.html` ships `class="dark"` so
the first paint is dark, and `main.tsx` applies a stored choice over the top.
The switch is in Settings; the tokens are in `@tiny/ui`.
