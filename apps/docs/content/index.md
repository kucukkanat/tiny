# Tiny plugins

Tiny is a chat client that runs entirely in your browser. A **plugin** is how you
change what it does — add a command, bind a shortcut, give the model a new tool,
or render your own React into the app — without forking it.

There is one API, and it is [pi's extension SDK](https://github.com/earendil-works/pi).
A pi extension that touches only the parts of that SDK which survive a
non-terminal frontend runs here unmodified.

<!--cards-->

## A plugin is a function

That is the whole shape. It receives `pi`, registers what it wants, and returns.

```ts
import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

export const shout = (): IdentifiedPlugin =>
  definePlugin("shout", (pi) => {
    pi.registerCommand("shout", {
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
| Gets | the same `pi` | the same `pi` |

The second row is the interesting one. [`@tiny/plugin-manager`](runtime.md) is
itself an ordinary plugin whose factory is `async`: before it returns, it has
imported everything you installed and called each one with **the same `pi`
object** it was handed. What they register lands in the app's one registry,
indistinguishable from code that shipped in the build.

That is the entire mechanism, and it is why nothing in the host had to change to
support loading code at runtime. [How runtime plugins work](runtime.md) covers
what that costs and what guards it.

## What a plugin may register

| Call | Adds |
| --- | --- |
| `pi.registerCommand(name, opts)` | a slash command, with argument completions |
| `pi.registerShortcut(key, opts)` | a keybinding, in pi's `KeyId` format |
| `pi.registerTool(tool)` | a [tool](tools.md) the model may call mid-answer |
| `pi.registerProvider(id, config)` | another [endpoint](providers.md) in the model picker |
| `pi.registerMarkdownTransformer(fn)` | a rewrite of message text on its way to the screen |
| `pi.on(event, handler)` | a hook on the request lifecycle |
| `pi.events` | a bus for talking to other plugins |
| `pi.contribute(slot, Component)` | React into one of five named regions |

Every one of those is pi's, with pi's name and signature, except the last.
[`contribute`](slots.md) is the single addition — pi's answer to rich UI returns
terminal components, which is exactly the half that cannot cross into a browser.

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
