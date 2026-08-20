# Publishing a plugin

Two audiences want your plugin in two different shapes: someone building an app
wants a package to import, and someone *using* an app wants a single file to
install from the Plugins dialog. Both are worth shipping, and they are not much
work apart.

## Naming a package

The convention follows `eslint-plugin-*` / `vite-plugin-*`, so it reads the same
way to anyone arriving from npm:

| | |
| --- | --- |
| First-party, in this repo | `@tiny/plugin-<name>` — e.g. `@tiny/plugin-fs` |
| Third-party, unscoped | `tiny-plugin-<name>` — searchable on npm |
| Third-party, scoped | `@<vendor>/tiny-plugin-<name>` |
| The host itself | `@tiny/plugin` — never a plugin |

The rule of thumb: **`plugin-` follows the scope in every plugin package name.** `@tiny/ai` and `@tiny/ui` are libraries, not plugins, and their
names say so.

## Shape of a package

Default-export nothing. Export a named factory that returns a `Plugin`, so a
registry reads as a list of configured plugins rather than a list of imports:

```ts
// tiny-plugin-notion/src/index.ts
import type { Plugin } from "@tiny/plugin";

export type NotionOptions = { readonly token: string };

export const notion = ({ token }: NotionOptions): IdentifiedPlugin =>
  definePlugin("notion", (pi) => {
    pi.registerTool({ name: "notion_search", /* … */ });
  });
```

```ts
export const plugins: readonly IdentifiedPlugin[] = [fileSystem(), notion({ token })];
```

Take `@tiny/plugin` as a **peer dependency**, not a dependency — the host must be
the one the app is running, and two copies would mean two registries.

```json
{
  "name": "tiny-plugin-notion",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "peerDependencies": { "@tiny/plugin": "*" }
}
```

Ship a `README.md` with runnable examples. Every package in this repo does, and
the examples are real files under `examples/` that the test suite executes — so a
snippet cannot rot into something that no longer runs.

## Shape of an installable file

For the Plugins dialog, publish **one file with a default export**. TypeScript
and JSX are compiled in the user's browser at install time, so publish the source
rather than a build of it:

```tsx
import type { Plugin } from "@tiny/plugin";

const Shout: Plugin = (pi) => {
  pi.registerCommand("shout", {
    description: "Send the draft in caps",
    handler: (_args, ctx) => ctx.chat.send(ctx.ui.getEditorText().toUpperCase()),
  });
};

export default Shout;
```

Publishing source rather than output is the point: the install dialog shows the
user exactly what it is about to store, and a bundle is not something anyone can
review. Constraints:

- **Types are stripped, not checked.** The browser has no typechecker and no
  `node_modules`. Your CI is the only thing that will catch a type error, so run
  `tsc` before you publish — the app will not.
- **Only the host's modules can be imported by name.** `react`,
  `react/jsx-runtime` and `@tiny/plugin` everywhere, plus whatever the app adds
  (this one adds `@tiny/ui`). Each resolves to the app's own instance, which is
  what makes hooks work. Anything else is refused at install, with the allowed
  list in the message. Import from an absolute URL if you need more.
- **One file.** Relative imports have nothing to resolve against; a blob URL has
  no directory. Bundle to a single module.

Pre-building still works, and is worth it if your plugin has dependencies a host
will not offer — bundle them in and publish the output:

```bash
bun build src/index.tsx --outfile dist/plugin.js --format esm --target browser --external react
```

Keep `react` external: bundling it in gives your plugin a second copy, whose
hooks will throw the moment the app renders your component.

## Serving it

Anywhere with permissive CORS: a gist's raw URL, a GitHub Pages site, any static
host. The app fetches it with a plain `fetch`, so the response needs
`Access-Control-Allow-Origin`, and the URL must be `http(s)`.

What the user's browser runs is the copy stored **at install time**, not whatever
the URL serves later. That is deliberate — see
[the trust boundary](runtime.md#the-trust-boundary) — and it has a consequence for
you as a publisher:

> **Publishing a new version does not update anyone.** Each user re-pins by
> clicking `Update`, which re-fetches and shows them the new hash. Treat a URL as
> a release channel, and keep old versions working.

If you want an install to be reviewable, publish the file at a URL that includes
the version or a commit SHA, so the source someone approved stays retrievable.

## Both at once

A package can export the factory *and* ship the built single-file plugin:

```json
{
  "exports": { ".": "./src/index.ts" },
  "files": ["src", "dist/plugin.js"],
  "scripts": {
    "build": "bun build src/index.ts --outfile dist/plugin.js --format esm --target browser"
  }
}
```

The difference between the two artifacts is only the export style — a named
factory the app calls itself, versus a default export the manager calls for it.
Keep one implementation and wrap it:

```ts
// src/index.ts        — for apps that bundle it
export const shout = (): IdentifiedPlugin => definePlugin("shout", (pi) => { /* … */ });

// src/standalone.ts   — for the Plugins dialog
import { shout } from "./index.ts";
export default shout();
```
