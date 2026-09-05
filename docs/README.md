# @tiny/docs

The documentation site. [Blume](https://useblume.dev) — markdown in `docs/`,
navigation inferred from the files, `meta.ts` where the order matters.

```sh
cd docs
bun install    # its own install, on purpose — see below
bun dev        # :4321
bun run build  # static HTML in dist/
```

## Why it isn't in `packages/`

It is the one thing here that isn't part of the app, and its toolchain is
heavier than the app's. Installed into the workspace, Blume's `shiki@4` hoists
over the `shiki@3` that `@tiny/ui`'s streamdown expects, and `bun typecheck`
fails in a package that hasn't changed. A separate install keeps the docs
toolchain out of the app's dependency graph entirely.

`knip.ts` still knows about it: `blume.config.ts` and every `docs/**/meta.ts`
are entries nothing imports.

## Writing a page

```mdx
---
title: The shell
description: One line, rendered as the intro.
---
```

Frontmatter is strict — an unknown key fails the build, which is how a typo gets
caught. Callouts are `:::note` / `:::tip` / `:::warning` / `:::danger`, and
`Card`, `CardGroup`, `Steps` and `Step` need no import.

Ordering: `meta.ts` in a folder lists its `pages`, `sidebar.order` in
frontmatter orders a loose page, and the file system decides the rest.
