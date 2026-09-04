# @tiny/plugin-extensions

Extensions you install into the app while it is running. One ES module, fetched
from a URL and imported in the tab.

A **plugin** is built into the app; adding one is a commit and a deploy. An
**extension** is added by whoever is using it, from a URL, and is live in the
next message. This package is the plugin that hosts them.

## What an extension looks like

The default export is a function of the host that returns a plain object. There
is no `activate`, nothing to tear down, and no side effects — which is what makes
turning one off exactly as cheap as turning it on.

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

Everything past `id` and `title` is optional:

|                |                                                                    |
| -------------- | ------------------------------------------------------------------ |
| `Screen`       | a route at `/#/<id>`, rendered by the shell like any plugin's      |
| `Sidebar`      | a section in the left sidebar                                      |
| `tools`        | functions the model can call mid-answer                            |
| `providers`    | a model API, offered in Settings beside Anthropic and OpenAI       |
| `actions`      | an entry in the bar shown when a passage of a reply is highlighted |
| `instructions` | a line added to the model's system prompt                          |
| `css`          | a stylesheet, adopted while the extension is on                    |

`tiny`, the argument, is three things: `useChats()` for the conversations so far,
`useModel()` for the configured model, and `ask()` to put a question in the chat
and wait for the answer. Everything else an extension needs is already the
platform — `localStorage` for its own state, `react-router` to navigate, Tailwind
on the app's tokens to look right.

## What you may import

Five bare specifiers, resolved by an import map in the page:

```
react   react/jsx-runtime   react-router   zod   ai
```

Those are the ones that break in a second copy — React and the router carry
context, and one zod means a `.describe()` survives into what the model is told.
Anything else you bundle yourself. Build with all five marked external, or the
copy of React you ship will throw `Invalid hook call` on its first render.

## Installing one

Paste a URL. It has to be a real ES module served with a JavaScript MIME type and
`Access-Control-Allow-Origin`, which in practice means jsDelivr, esm.sh, or
GitHub Pages. Two addresses that look right and are not: `raw.githubusercontent.com`
and gist raw URLs both send `text/plain`, and no browser will run that.

Pin a tag or a commit. jsDelivr serves a branch address with a week of browser
cache, so an update would look like it did nothing.

A link can carry one: `/#/extensions/install?url=…` opens the page describing what
it registers, with the switch off. It never turns itself on — otherwise any web
page could link someone into running code against their API key.

## What it can do to you

Everything the app can. An extension runs in the page, on the same thread, with
`localStorage` in reach — your API key and every conversation you have had. There
is no sandbox and there is no permission list, because a permission this app
cannot enforce is a checkbox pretending to be a lock. A Worker would not help
either: a screen has to render on this thread.

So the screen shows what it will add before you turn it on — every tool with the
parameters read back out of its compiled schema, every provider, and the
`instructions` verbatim, since a system prompt is otherwise the one contribution
that never appears anywhere. Read it the way you would read anything else you are
about to run on your machine.

## Reloading

Each install carries a version counter, and the loader puts it in the query. That
is what gets past the three caches between an author and you: the module map,
which never re-fetches a URL it has already seen; the browser's, which holds a
CDN answer for up to a week; and the service worker's. It only moves when you
press Reload, so an extension you already have keeps working offline.

## Storage

One `localStorage` key per extension, `tiny.extension.<id>`, holding
`{ id, url, title, version, enabled }`. `title` is remembered from the last
successful load so a row has a name before anything is fetched. Anything zod
won't vouch for on read is dropped rather than crashing the list.
