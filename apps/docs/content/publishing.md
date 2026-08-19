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

The rule of thumb: **`tiny-plugin-` appears in every plugin package name, and
nowhere else.** `@tiny/ai` and `@tiny/ui` are libraries, not plugins, and their
names say so.

## Shape of a package

Default-export nothing. Export a named factory that returns a `Plugin`, so a
registry reads as a list of configured plugins rather than a list of imports:

```ts
// tiny-plugin-notion/src/index.ts
import type { Plugin } from "@tiny/plugin";

export type NotionOptions = { readonly token: string };

export const notion = ({ token }: NotionOptions): Plugin => (pi) => {
  pi.registerTool({ name: "notion_search", /* … */ });
};
```

```ts
export const plugins: readonly Plugin[] = [fileSystem(), notion({ token })];
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

For the Plugins dialog, publish **one JavaScript file with a default export**:

```js
export default (pi) => {
  pi.registerCommand("shout", {
    description: "Send the draft in caps",
    handler: (_args, ctx) => ctx.chat.send(ctx.ui.getEditorText().toUpperCase()),
  });
};
```

There is no build step between that file and the page, so:

- **Plain JavaScript.** No TypeScript, no JSX. If you write either, compile first
  and publish the output.
- **No bare specifiers.** `import … from "react"` does not resolve — there is no
  import map. Import from an absolute URL, or do without.
- **One file.** Relative imports have nothing to resolve against; a blob URL has
  no directory. Bundle to a single module.

Building an installable file from a TypeScript source is one command:

```bash
bun build src/index.ts --outfile dist/plugin.js --format esm --target browser
```

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
export const shout = (): Plugin => (pi) => { /* … */ };

// src/standalone.ts   — for the Plugins dialog
import { shout } from "./index.ts";
export default shout();
```
