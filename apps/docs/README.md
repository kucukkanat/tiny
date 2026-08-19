# @tiny/docs

The plugin documentation site, published at
[kucukkanat.github.io/tiny](https://kucukkanat.github.io/tiny/) with the chat app
alongside it at `/app/`.

A static site generator small enough to read in one sitting: markdown in,
directory-indexed HTML out. No Vite, no Node — the same Bun toolchain as
`apps/chat`.

```sh
bun run --filter @tiny/docs build   # → apps/docs/dist
bun run docs                        # build, then serve on :4321
bun run build:site                  # docs at /, chat app at /app/ → dist
bun test apps/docs
```

## Editing

Content lives in [`content/`](content) as plain markdown. To add a page:

1. Write `content/<name>.md`, starting with a single `# Heading`.
2. Add it to a section in [`src/site.ts`](src/site.ts).

That list is the single source of truth — build order, the sidebar, the
previous/next pager, the home page's card grid and the search index all read from
it, so a page that is not there does not exist.

## Conventions

**Internal links are written as GitHub writes them** — `[slots](slots.md)` — and
rewritten at build time to the relative URL of the built page. The content files
stay readable in the repo, and a link to a page that does not exist fails the test
suite.

**Every URL the site emits is relative**, so it works at `/`, at `/tiny/`, or
from a `file://` directory with no configuration. The only exception is
`404.html`, which is served at any depth and therefore takes the deploy base as
`--base=/tiny/`.

**A snippet can claim to be a real file:**

````md
```ts path=packages/plugin/examples/clearChat.ts
…
```
````

`test/examples.test.ts` then asserts the block matches that file byte for byte, so
a documented example cannot rot into something that no longer compiles.

## How it is put together

| File | Does |
| --- | --- |
| `src/site.ts` | the page list — sections, slugs, titles, blurbs |
| `src/render.ts` | markdown → HTML via `marked`, highlighted by `shiki` at build time |
| `src/shell.ts` | the page template: top bar, sidebar, on-this-page, pager |
| `src/build.ts` | renders every page, writes assets, emits the search index |
| `src/client.ts` | the only browser JavaScript: search and the mobile nav toggle |
| `src/docs.css` | layout only — every colour comes from `@tiny/ui/tokens.css` |

Code is highlighted once, at build time, in both themes at once — Shiki emits
`--shiki-light` and `--shiki-dark` custom properties, and CSS picks one. Nothing
re-highlights in the browser, and there is no flash on load.

Styling imports the very `tokens.css` the chat app renders against rather than a
copy of its values, which a test asserts — so the site and the app it documents
cannot drift apart.
