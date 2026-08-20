# Tiny plugins

Tiny is a chat client that runs entirely in your browser. A **plugin** is how you
change what it does — add a command, bind a shortcut, give the model a new tool,
or render your own React into the app — without forking it.

There is one API, and it is [pi's extension SDK](https://github.com/earendil-works/pi).
A pi extension that touches only the parts of that SDK which survive a
non-terminal frontend runs here unmodified.

<!--cards-->

## A plugin is a function

That is the whole shape. It receives `tiny`, registers what it wants, and returns.

pi's own documentation calls that object `pi`. It is the factory's first
parameter, so the name belongs to whoever wrote the factory — an extension
brought over from `.pi/extensions/` runs here with its parameter still spelled
`pi`, and every method keeps pi's name and signature either way.

```ts
import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

export const shout = (): IdentifiedPlugin =>
  definePlugin("shout", (tiny) => {
    tiny.registerCommand("shout", {
      description: "Send the draft in caps",
      handler: (_args, ctx) => ctx.chat.send(ctx.ui.getEditorText().toUpperCase()),
    });
  });
```

Registering is all a factory does. Everything it registered is collected into one
registry, and the app renders from that — so a plugin never reaches into the app's
components, and the app never enumerates its plugins.

## Two ways in, one registry

A plugin reaches the app one of two ways, and **the app cannot tell them apart**.

| | Bundled | Runtime |
| --- | --- | --- |
| Written as | a module in the repo | a single file with a `export default` |
| Arrives by | being listed in `apps/chat/src/plugins/index.ts` | being installed from a URL or pasted into the Plugins dialog |
| Needs a rebuild | yes | no |
| Gets | the same `tiny` | the same `tiny` |

The second row is the interesting one. [`@tiny/plugin-manager`](runtime.md) is
itself an ordinary plugin whose factory is `async`: before it returns, it has
imported everything you installed and called each one with **the same `tiny`
object** it was handed. What they register lands in the app's one registry,
indistinguishable from code that shipped in the build.

That is the entire mechanism, and it is why nothing in the host had to change to
support loading code at runtime. [How runtime plugins work](runtime.md) covers
what that costs and what guards it.

## What a plugin may register

| Call | Adds |
| --- | --- |
| `tiny.registerCommand(name, opts)` | a slash command, with argument completions |
| `tiny.registerShortcut(key, opts)` | a keybinding, in pi's `KeyId` format |
| `tiny.registerTool(tool)` | a [tool](tools.md) the model may call mid-answer |
| `tiny.registerProvider(id, config)` | another [endpoint](providers.md) in the model picker |
| `tiny.registerMarkdownTransformer(fn)` | a rewrite of message text on its way to the screen |
| `tiny.on(event, handler)` | a hook on the request lifecycle |
| `tiny.events` | a bus for talking to other plugins |
| `tiny.contribute(slot, Component)` | React into one of five named regions |
| `tiny.registerPanel(id, opts)` | a [panel](panels.md) in the right-hand rail |
| `tiny.registerRoute(path, opts)` | a [page](panels.md#pages) of your own, at an address |

Every one of those is pi's, with pi's method name and signature, except the last
three.
[`contribute`](slots.md), [`registerPanel` and `registerRoute`](panels.md) are the
additions — pi's answer to rich UI returns terminal components, which is exactly
the half that cannot cross into a browser, and a terminal has neither a right-hand
rail nor an address bar to inherit.

There is more of the SDK than this: `setModel`, `sendUserMessage`,
`getActiveTools`/`setActiveTools`, `setSessionName`, and on `ctx`, `abort`,
`isIdle`, `getContextUsage`, `newSession` and `reload`. The
[compatibility page](pi-compat.md) is the full accounting — what is inherited,
what is reduced, and what is absent.

## Where to go next

If you want to **write** a plugin, start with the [Quickstart](quickstart.md) and
then read [Anatomy of a plugin](anatomy.md).

If you want to know **how installing code at runtime can possibly be safe**, read
[How runtime plugins work](runtime.md) — the short answer is that it is not
sandboxed, it is *pinned*, and the page is honest about the difference.

If you are putting this host in **an app of your own**, read
[Hosting the plugin system](host.md).
