# @tiny/plugin-pi

pi compatibility, kept out of the way of everyone who does not want it.

`@tiny/plugin` is shaped after [pi's extension SDK](https://github.com/earendil-works/pi),
and most of that shape is simply the SDK — dialogs, commands, shortcuts, tools,
events. This package is the rest: the part that exists only so a pi extension
does not crash.

| Export | Is |
| --- | --- |
| `piTerminalUI` | the seventeen `ctx.ui` methods a browser cannot implement, returning what pi's RPC mode returns |
| `piExtension(setup)` | wraps an extension so it may subscribe to the pi events this host never fires |
| `PiTerminalUI`, `PiUIContext`, `PiPluginAPI`, `UnfiredEvent` | the types for the above |
| `identityTheme`, `ThemeLike` | `ctx.ui.theme` with every method the identity, so `theme.fg("accent", "●")` yields `"●"` |

## Turning it on

```tsx
import { PluginHost } from "@tiny/plugin";
import { piTerminalUI } from "@tiny/plugin-pi";

<PluginHost plugins={plugins} uiFallbacks={piTerminalUI}>
  <App />
</PluginHost>;
```

Without it, `ctx.ui` carries only methods that do something, and an extension
reaching for `setFooter` gets a `TypeError` — which is the better failure for an
app that never intended to run pi extensions, and the one it now gets.

`uiFallbacks` is spread **first**, so nothing here can shadow a method the host
really implements. Filling a gap is what it is for; replacing behaviour other
plugins depend on is not.

## Why it is a separate package

It was in the core, on by default. Every app carried seventeen methods that do
nothing, and every plugin author's autocomplete offered them alongside the ones
that work — sixteen dead entries among twelve live ones, indistinguishable
until you called one and nothing happened.

The types were split out first, so the dead half stopped appearing to authors
who had not asked for it. This is the other half of the same move: the runtime
no longer carries it either, unless an app says it wants it. What
`@tiny/plugin` is left with is one product's SDK rather than one product's SDK
plus a compatibility layer for a different product.

## What compatibility still means

The full accounting is on the docs site under
[pi compatibility](../../apps/docs/content/pi-compat.md) — what is inherited
verbatim, what degrades, what is reduced, and what has no pi equivalent at all.
The short version has not changed: **a pi extension that touches only
RPC-portable methods runs here unmodified**, and one that touches the rest needs
this package.
