# CLAUDE.md

## The first law

Least lines of code. Write composable, reusable pieces and combine them.

Every time you're about to add code, check whether existing code already does it,
or could with a small change. Deleting code to solve a problem is a win, not a cop-out.

Corollaries:

- No speculative abstraction. Build it when the second caller shows up, not before.
- No wrapper that only forwards arguments.
- No config option with one possible value.
- A small, sharp function beats a large, flexible one.

## Cognitive load

Someone reading this code for the first time should be able to follow it without
holding much in their head. Optimize for that reader, not for the person who
already knows how it works.

- A file should be understandable on its own. If you have to open four others to
  see what one function does, that's a design problem.
- Name things what they are. A good name saves a comment.
- Short call chains. Fewer layers between the entry point and the thing that
  actually happens.
- Obvious over clever. If a trick needs a comment to explain it, write the boring
  version.
- One way to do a thing, not three.

This bounds the first law: fewest lines, but never code golf. If shorter makes it
harder to read, it's not shorter — the cost just moved to the reader.

## Structure

Monorepo with packages. Each package:

- does one thing
- has a README that shows what it does and how to use it
- ships runnable example code where an example helps

Examples must actually run. A broken example is worse than none.

Plugins are packages too, named `plugin-<name>` (`packages/plugin-fs`,
`packages/plugin-settings`). One plugin per package, no exceptions — a plugin that
needs a second plugin is two packages.

## The app

It runs in the browser. All of it — no server-side step, no build-time backend.
If something can't run in a browser tab, it doesn't go in.

It's a PWA: installable, works offline, has a manifest and a service worker.

Mobile first. Touch is the primary input, not an afterthought:

- tap targets big enough to hit with a thumb
- layouts that work on a phone and scale up, not the reverse
- no hover-only interactions, no tiny click targets, no fixed pixel widths

Every interactive element gets a `data-testid`.

### Shell and plugins

The app layer is razor thin. The shell does routing, layout, and the plugin
host — nothing else. Every actual feature is a plugin.

If you're about to add a feature to the shell, stop: it's a plugin. The shell only
grows when plugins need a new extension point, and then it grows by the smallest
hook that works.

A plugin depends on `plugin-host` and nothing else with `plugin-` in its name.
When one needs something another owns, it exports a factory that takes it and
`packages/app/src/plugins.tsx` fills it in — that file is where features meet.
`chat({ useModel, unconfigured, useTools, Panel })` is the whole of it today:
chat calls a model without knowing settings exists, and runs tools without
knowing plugin-extensions does. `plugins.test.ts` fails the build if that slips.

### Plugins and extensions

Two ways to add a feature, and the difference is _when_.

A **plugin** is build time. It is a package in this repo, it ships in the bundle,
and adding one is a commit and a deploy. Everything the app does itself is a
plugin.

An **extension** is run time. Whoever is using the app installs one and it is
live in the next message — no build, no deploy, nothing installed on a server.
It is one ES module, `import()`ed in the tab. `packages/plugin-extensions` hosts
them; `packages/extension-starter` is a real one that ships with the app.

There is no other way to give the model a tool. There used to be a `plugin-tools`
that let you write one in a textarea, which was a second mechanism for the same
job; it is gone, and what it stored is carried across on first boot by
`migrate.ts`, which can be deleted once nobody is upgrading from a build that had
it.

Four ways to install: a URL, a file off the disk, one of three premades in
`templates.ts`, or text typed into the editor. The last three are kept as source
and run from a `blob:` minted per version — so they work offline, survive a
reload, and can be edited in place. Two things follow from there being no build
step. A written extension cannot use JSX, so the premades use `createElement`;
and it cannot import anything the map does not carry, not even a file beside it,
because a blob has no base to resolve against. Editing saves but does not run:
importing a module executes it, and a loop you are halfway through writing would
take the tab with it, so Run is a button.

The contract for both lives in `plugin-host`, because both are features:
`Extension` is a `Plugin` with an optional `Screen`, plus `tools`, `providers`,
`actions`, `instructions` and `css`. The module default-exports a function of
the host — the same "take what you don't own as an argument" rule plugins follow,
applied to a module that arrives after the build.

Extensions reach five bare specifiers through an import map in `index.html`:
`react`, `react/jsx-runtime`, `react-router`, `zod`, `ai`. Only those, and only
because a second copy of each genuinely breaks — React and the router carry
context, and one zod is what keeps a `.describe()` in what the model is told.
Everything else an extension bundles itself, so the cost lands on whoever
installs it rather than on every first visit. The shims are
`packages/app/src/sdk/*.ts`, they are named export by export, and
`preserveEntrySignatures: 'allow-extension'` is what stops the build emptying
them.

An extension runs in the page with the API key in reach. There is no sandbox and
no permission list, because a permission this app cannot enforce is theatre — and
a Worker can't render a screen. What there is instead: the Extensions screen
shows what an extension registers, and its `instructions` verbatim, before the
switch is turned on, and an install link never turns itself on.

### Talking to models

The Vercel AI SDK (`ai` + the `@ai-sdk/*` providers) is how this app talks to
models. Don't hand-roll fetch calls, SSE parsing, or per-provider request shapes —
the SDK already does it, for every provider, and it does it right.

Reach past the SDK only for what it genuinely doesn't cover, and keep that part small.

### UI

Vercel AI Elements (`bun x ai-elements@latest add <name>`) is where AI components
come from — it's a shadcn registry built on the AI SDK, so its components already
speak `useChat`'s message parts. Never write an adapter layer around them.

Everything lands in `packages/ui`. Plugins import `@tiny/ui`; nothing else touches
the registry. Add a component when a plugin needs it — not the whole catalogue.

Weigh what a component costs before adding it, in bundle as well as lines.
`prompt-input` was 1,363 lines and dragged in six more files for a command
palette, a dropdown and an attachment picker this app has no use for; the
composer that replaced it is 84 lines in `plugin-chat`. `message`'s mermaid
plugin was a static import, so mermaid, d3 and rough loaded on first paint
whether or not a reply drew a diagram — a quarter of the payload. Both are gone.

When a registry component is mostly features we don't want, write the small one
and say so here. Measure the build before and after: `bun run build` prints the
precache size, and what `index.html` preloads is what every visit pays for. Note
that `globPatterns` keeps scripts out of the precache, so the number that moves
for a JS change is the `index-*.js` line, not the precache total.

`switch` is the only registry component added since; the tool list needs an
on/off that reads as state rather than a button, and `radix-ui` was already a
dependency, so it cost one file.

A registry component arrives whole and is used in part, so the parts nothing
reaches get cut on the way in — `message`'s branch family and toolbar, which took
`button-group` with them, `conversation`'s markdown download, `sidebar`'s nine
unused rows, which took `skeleton` and `separator`. Rolldown already shook that
code out, so first paint's JS did not move; the CSS fell 1,497 B gzipped, because
`@source` scans `packages/ui/src` and Tailwind was generating utilities for class
strings in components nothing rendered. Dead vendored code is a CSS cost here,
not a JS one.

The editor you write one in is `prism-code-editor`, fetched on the first press
rather than shipped: **+141 B on first paint, 17,239 B gzipped when it arrives**
(15,097 JS + 2,142 CSS). CodeMirror 6 with the same features measured 147,273 B
gzipped — 8× — and is a contenteditable, so it re-implements the caret, the
selection handles and the magnifier that a phone gives away free. prism is a
real `<textarea>` under a highlighted `<pre>`, which is also why the screen tests
still drive it with `fireEvent.input`. The plain box stays as the fallback: a
chunk that fails to load is remembered as failed for the life of the document,
so there is nothing to retry, and the box is the whole feature minus the colour.

Completions are a table in `complete.ts`, not a language service. TypeScript in
the browser measured 1.76 MB gzipped and would be worse here anyway — five
overloads of `tool()` defeat its contextual typing, so it answers `tool({` with a
thousand globals. The world an extension lives in is five importable modules and
one object shape, which is small enough to know exactly: `Record<keyof Tiny, …>`
means adding to the contract fails the build until the table catches up. One
source, not several — prism merges whatever every source returns, and a list that
offers `response.` the other words in your file is a list that suggests code
which does not exist.

Runtime extensions cost first paint +20,522 B raw / +11,425 B gzip when they
landed, and deleting `plugin-tools` then took 176,833 B raw and 39,642 B gzip
back off it — so the whole of it, tools included, is now smaller than what it
replaced. Of what the extensions themselves cost, the import map was +5,786 raw
/ +6,893 gz, and 1,728 B of that is not code at all but gzip context lost to
splitting one chunk into eight. Exposing whole libraries instead of named
exports was measured at +65 kB gz, nearly all of it `export * from 'ai'` and
`export * from 'react-router'` — so the shims name every export, and
`sdk.test.ts` fails if the react list drifts from what React has. `@tiny/ui` is
deliberately not on the map: it has no barrel, and a barrel makes `message.tsx`
reachable, which drags in streamdown and the 305 shiki chunks.

The number to watch is no longer the `index-*.js` line on its own — first paint
is now that chunk plus everything `index.html` preloads. `bun run measure` in
`packages/app` prints it.

beautifului.dev ships no code — no registry, no npm package, no per-component
page, checked. So what it showcases gets written here from its rendered markup,
on our tokens, and only where the app already has the data to fill it: its
loading state and code block are in `packages/ui`, its tool chips and selection
actions in `plugin-chat`, its approval card in `plugin-extensions`. Together they
cost 1.5 kB gzipped, because none of them pull a dependency.

The other twelve it showcases aren't built and shouldn't be until something
produces what they display: task rows, recommendation, context cards, three
tables, insight cards and the fine-tune inspector have no data behind them here,
and the flowchart needs mermaid, which was removed on purpose for its weight.

Zod is whole in the build, and has to be: you can't write `z.enum` in an
extension if `z.enum` was shaken out. It used to be whole _and_ on the first
paint path, because `plugin-tools` handed `z` to `new Function` and rolldown
could not see through that. With tools gone, the app's own use shakes down to a
handful of members in the entry, and the full surface sits in `sdk/zod.js` —
173 kB that only a page loading an extension ever fetches. Deleting that plugin
took 176,833 B raw and 39,642 B gzipped off first paint, and a whole chunk with
it.

### Width

Measure the room with a container query, not a viewport breakpoint. The sidebar
is 16rem and appears at 768px, so what a screen actually gets is not monotonic:
735px of room at a 767px window, **480px at 768px**, back to 736px at 1024px. A
`md:` rule therefore fires at the narrowest moment there is, and no viewport
query can see that the sidebar is collapsed, which is a cookie the user toggles.
`@container` on a screen's own root, with `@2xl:`/`@6xl:` variants, is the rule.
Viewport breakpoints are still right for the thing they actually describe —
`md:` for touch versus pointer, as the sidebar rows use it.

A container query has to sit _outside_ the width it controls. `@container` and
`max-w-*` on the same element measures the capped width, so the wide layout can
never come true.

Three widths, and no more: `max-w-2xl` reads and writes (chat, and an extension's
editor), `max-w-5xl` holds a grid of things (the extension list), `max-w-6xl` is
the editor beside what it produced. A form does not get more readable past about
480px of control — that is the longest endpoint anyone writes plus slack — so
Settings caps its cards rather than stretching, and the leftover reads as margin
because the cards have edges. Whitespace around a bounded object is design;
whitespace around an unbounded column is a missing section.

Design tokens are Tailwind v4 `@theme` custom properties in `packages/ui`:
colour, type, spacing, radius, elevation and motion, all of it, so restyling is
one file. The values are beautifului.dev's own, read off its stylesheet. shadcn's
names (`--background`, `--muted`, `--primary`…) are aliases onto that palette
rather than a second set, so a registry component inherits the look untouched —
which is why `--accent` there means "hover surface" and the blue is `--brand`.

[beautifului.dev](https://beautifului.dev/) is the visual target: how it should
look and feel, not where code comes from. It ships no package — no registry, no
npm, no copy-paste source, checked. What it showcases we build, on its tokens.

### Routing

React Router, `HashRouter`. Hash routing because the app is static files with no
server to rewrite paths.

Refresh must not lose state. What the user was doing lives in the URL or in
storage, never only in memory:

- what to show — route and params in the URL, so a reload and a shared link land
  in the same place
- what the user typed or picked — persisted, restored on mount
- transient UI (open menu, hover) — memory is fine, nobody misses it

Test it by hitting reload. If anything the user would care about is gone, it's a bug.

## Tests

Unit tests only. No end-to-end tests, no browser automation, no test servers.

Same law as the code: least output, most benefit. A test earns its place by
catching a real break.

- Test behaviour, not implementation. If a refactor that changes nothing about
  what the code does breaks the test, the test was wrong.
- Cover the logic and the edge cases. Skip the getters and the glue.
- No test written for a coverage number.

Component tests select by `data-testid`.

## Git

Work on `main`. Commit and push when the change is done — don't leave work sitting
in the working tree, and don't branch unless asked.

## Voice

Sound like a competent engineer. Not an AI assistant, not a status report.

Say what matters, omit what doesn't:

- "I found the bug in X" — not "I identified an issue pertaining to X."
- "I'll change X because Y" — not three paragraphs.
- "This failed because X" — not "Unfortunately, this encountered an issue."
- "Done — tests pass" — not a completion summary.

Don't:

- narrate tool calls
- announce obvious actions
- repeat yourself
- pad with corporate filler
- over-explain simple changes
- reach for a fancy word when a plain one works
- write summaries that contain no information

Plain words. No jargon unless it's the only accurate term.
