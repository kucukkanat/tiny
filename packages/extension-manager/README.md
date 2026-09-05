# @tiny/extension-manager

Extensions you install into the app while it is running. One ES module, fetched
from a URL and imported in the tab.

There is one kind of feature and two ways to deliver it. One listed in
`packages/app/src/extensions.tsx` ships in the bundle; adding it is a commit and
a deploy. One that isn't listed is added by whoever is using the app, from a URL,
and is live in the next message. This package is the registry both go through,
and the screen you add the second kind on.

## What an extension looks like

The default export is a function of the host that returns a plain object. There
is no `activate`, nothing to tear down, and no side effects — which is what makes
turning one off exactly as cheap as turning it on.

```tsx
import type { Extension, Tiny } from '@tiny/host'
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
| `Screen`       | a route at `/#/<id>`, rendered by the shell like any other's       |
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

Five ways, and four of them keep the source rather than an address.

**A URL.** It has to be a real ES module served with a JavaScript MIME type and
`Access-Control-Allow-Origin`, which in practice means jsDelivr, esm.sh, or
GitHub Pages. Two addresses that look right and are not: `raw.githubusercontent.com`
and gist raw URLs both send `text/plain`, and no browser will run that.

**A file**, picked off the disk. Its text is what gets stored, so nothing has to
still be there tomorrow.

**A blank one.** An empty editor, so what is on the clipboard is one paste from
installed. It is named `Pasted` until the text in it says what it calls itself.

**One of three premades** — a tool that fetches, a tool that asks you something,
and a screen. Pick one and it opens in the editor, yours to change.

**Text you write in the app**, in the box on any extension you own.

A written extension is kept as source and run from a `blob:` URL minted fresh
each time the page loads, so it works offline and survives a reload. Two things
follow from nothing compiling it:

- **JSX works**, and only here. It is compiled on the way to being run, so what
  you write in the box can use tags. An extension installed from a **URL** is
  not compiled — it is fetched and imported as it is — so JSX in one fails with
  `Unexpected token '<'`. Put JSX through your own build before you publish it.
- **No TypeScript.** Types are not stripped, so a `: string` is a syntax error.
- **No imports beyond the five below** — not even a file sitting next to it, since
  a blob URL has no base to resolve a relative path against.

Editing saves as you type, so a reload costs you nothing, but nothing runs until
you press Run. While it is off the row takes its name from the `title:` in the
box, read off the text rather than by running it, so it reads right before it
has ever been switched on; once it is on, the module's own title is the name. Importing a module executes it, and a loop you are halfway through
writing would take the tab with it.

## The editor

Syntax highlighting on the app's own palette, and completions that know what an
extension can reach:

- `tiny.` offers exactly what the host hands you, with signatures.
- `z.` offers the builders a schema is made of.
- Inside an import's quotes, only the five specifiers that resolve — anything
  else is a module that fails before it runs.
- At the top level, snippets for the shapes worth having whole: the module
  itself, a tool, a screen, a question. Each stops where you have to type.
- A path it knows nothing about gets nothing. An editor that answers `response.`
  with the other words in your file is one that suggests code which does not
  exist.

Ctrl-Space asks explicitly. On a phone, the row of keys above the keyboard is
the tab, the brackets and the quotes a virtual keyboard hasn't got; it appears
when the keyboard does and never takes focus away from what you are typing.

It is fetched the first time you open one, not shipped with the app, and the
plain box is what you get until it lands — offline on a first visit, say.

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
`{ id, title, version, enabled }` and then either a `url` or a `source` — one or
the other, never both, which is the only thing every reader has to know. `title`
is remembered from the last successful load so a row has a name before anything
is fetched. Anything zod won't vouch for on read is dropped rather than crashing
the list.

A store with no room left is a real answer here, because for a written extension
the source _is_ the extension. Nothing is shown as saved until it is: the write
happens first, and the editor says so when there is no room.

Tools used to live under `tiny.tool.<id>` and be their own screen. `migrate.ts`
turns whatever is left of that into one extension each, on first boot, and can be
deleted once nobody is arriving from a build that had them.
