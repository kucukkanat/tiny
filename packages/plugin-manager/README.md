# @tiny/plugin-manager

A plugin that installs other plugins. Paste a plugin's source or point it at a
URL, and it runs from the next moment on — no rebuild, no page reload.

It adds a `plugins` command, a **Plugins** entry in the sidebar footer, and
`⌘⇧P` / `Ctrl+Shift+P`, all opening one dialog: what is installed, a switch for
each, and the two ways to add more.

```ts
import { pluginManager } from "@tiny/plugin-manager";

// Last in the list, so the plugins that ship with your app claim their command
// names first.
export const plugins = [settings(), fileSystem(), pluginManager()];
```

## How it can work at all

`loadPlugins` awaits every plugin factory, and this one is `async`. Before it
returns, it has read the manifest, imported each installed plugin as a module,
and called it with the **same** `tiny` it was handed — so what a plugin installed
at runtime registers is in the app's one registry, indistinguishable from a
plugin that shipped with the build. Commands, tools, shortcuts and slot
contributions all work.

Applying a change — adding, enabling, disabling, removing — calls
`ctx.reload()`, which re-runs every factory and rebuilds the registry. That is
what makes a removed plugin actually stop running: registrations have no undo of
their own, so unloading is rebuilding.

## TypeScript, JSX, and what a plugin may import

An installed plugin can be written in TypeScript and JSX. Both are compiled in
the browser, at install time, by [sucrase](https://github.com/alangpierce/sucrase)
— 47 KB gzipped, in its own chunk, fetched on the first compile rather than on
every visit. Types are *stripped*,
never checked: there is no typechecker in a browser and no `node_modules` to
check against, so an author's editor is the only thing that will catch a bad
type. Plain JavaScript passes through byte-for-byte unchanged.

Compiling is only half of it. A plugin is imported through a blob URL, which has
no package resolution behind it and no import map, so `import { useState } from
"react"` has nothing to resolve against. Every bare specifier is rewritten to a
generated module that re-exports the **host's own** instance:

```ts
pluginManager({ modules: { "@tiny/ui": tinyUi } });
```

`react`, `react/jsx-runtime` and `@tiny/plugin` are always available; `modules`
adds to them. Handing back the app's own React is the whole reason hooks work —
a second copy would carry its own dispatcher, and every hook a plugin called
would throw. Anything not on the list is refused at install time with the
allowed names in the message, and so is a relative import, which a single-file
blob module could never resolve.

## Where things are stored, and why in two places

| | Where | Reachable by |
| --- | --- | --- |
| Source | OPFS, `/plugins/<id>.js` | the page, **and the model's `@tiny/plugin-fs` tools** |
| Manifest — name, URL, approved SHA-256, enabled | `localStorage`, key `tiny:plugins` | the page only |

If `@tiny/plugin-fs` is enabled, the model can write files into the very
directory the sources live in. So a file being there grants it nothing: a plugin
runs only if the manifest has an entry for it and the file still hashes to the
value recorded there. A source that changed under a manifest entry is reported
as `modified` and skipped; a manifest entry with no file is `missing`.

That leaves the honest part: **an installed plugin is not sandboxed.** It gets
module scope in your page, the same context object your own plugins get, and can
read conversations, call your endpoint and render into the UI. It cannot be
otherwise — that is what a plugin *is*. The dialog shows the full source and its
hash before anything is written, and that approval is the whole trust boundary.
Only add code you would run yourself.

## Adding a plugin

**By URL.** The source is fetched, shown for approval, then stored. What runs
later is that stored copy, so an upstream edit cannot change what your browser
executes; `Update` re-fetches and re-pins on demand. `http(s)` only.

**By paste.** The same review step, with no URL to update from.

Either way the module must `export default` a function. The source is compiled
during the review step, so a syntax error, an import the host does not offer or a
module without that export is rejected before anything is stored — and what gets
pinned is the source the user read, not a build of it.

## API

Everything the dialog uses is exported, so you can drive installs from code:

```ts
import { openInstalled, fetchSource } from "@tiny/plugin-manager";

const store = openInstalled(); // localStorage + OPFS by default

await store.install({ name: "Greet", source: await fetchSource(url), url });
await store.inspect(); // entries with status: "ok" | "modified" | "missing"
store.setEnabled(id, false);
await store.update(id); // re-fetch a URL-installed plugin
await store.remove(id);
```

`openInstalled({ root, manifest, now })` swaps the OPFS root, the manifest storage
and the clock — `@tiny/plugin-manager/testing` and `@tiny/plugin-fs/testing` give
you in-memory implementations of the first two, which is how the examples below
run outside a browser.

## Examples

Each block is a real file under [`examples/`](examples), run by the test suite.

### Installing pasted source

`examples/install-from-source.ts`:

```ts path=packages/plugin-manager/examples/install-from-source.ts
import { loadPlugins } from "@tiny/plugin";
import { memoryRoot } from "@tiny/plugin-fs/testing";
import { openInstalled, pluginManager } from "@tiny/plugin-manager";
import { memoryManifest } from "@tiny/plugin-manager/testing";

// In a browser both stores default to the real thing: the manifest to
// localStorage and the source to OPFS. Here they are in memory, so the example
// runs under `bun run` — nothing else changes.
const disk = memoryRoot();
const options = { root: () => Promise.resolve(disk), manifest: memoryManifest() };

const store = openInstalled(options);

// This is what the dialog does once the user approves the source it showed
// them. Anything that is not a loadable module exporting a function is
// rejected here, before a byte is written.
const installed = await store.install({
  name: "Word count",
  source: [
    "export default (tiny) => {",
    '  tiny.registerCommand("words", {',
    '    description: "Count the words in the last reply",',
    "    handler: (_args, ctx) => {",
    "      const last = ctx.chat.messages.at(-1);",
    '      ctx.ui.notify(String(last?.content.split(/\\s+/).length ?? 0) + " words");',
    "    },",
    "  });",
    "};",
  ].join("\n"),
});

console.log(`installed ${installed.name} — sha256 ${installed.sha256.slice(0, 12)}`);

// And this is the app's startup: one `loadPlugins` call over the plugins that
// ship with the build. The manager's factory loads what the user installed into
// the very same registry.
const registry = await loadPlugins([pluginManager(options)]);
console.log(`commands: ${registry.commands.map((command) => command.invocationName).join(", ")}`);

// Disabling is immediate — the app calls `ctx.reload()` and the command is gone.
store.setEnabled(installed.id, false);
const withoutIt = await loadPlugins([pluginManager(options)]);
console.log(`disabled: ${withoutIt.commands.map((command) => command.invocationName).join(", ")}`);
```

```
installed Word count — sha256 cca4ea0c643a
commands: plugins, words
disabled: plugins
```

### A plugin written in TypeScript and JSX

`examples/install-typescript.ts`:

```ts path=packages/plugin-manager/examples/install-typescript.ts
import { loadPlugins } from "@tiny/plugin";
import { memoryRoot } from "@tiny/plugin-fs/testing";
import { openInstalled, pluginManager } from "@tiny/plugin-manager";
import { memoryManifest } from "@tiny/plugin-manager/testing";

// A plugin installed at runtime may be written in TypeScript and JSX. It is
// compiled in the browser at install time, so what the user approves is the
// source they can read rather than a bundle they cannot.
const disk = memoryRoot();
const options = { root: () => Promise.resolve(disk), manifest: memoryManifest() };
const store = openInstalled(options);

// Types are stripped, never checked — a plugin's types are worth whatever its
// author's editor made of them. `import type` disappears entirely, which is why
// a plugin can be fully typed against packages the host never offers.
const SOURCE = `
import type { Plugin, PluginAPI } from "@tiny/plugin";
import { useState } from "react";

type Props = { readonly greeting: string };

const Hello = ({ greeting }: Props) => {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount(count + 1)}>{greeting} {count}</button>;
};

const plugin: Plugin = (tiny: PluginAPI) => {
  tiny.contribute("app.overlays", () => <Hello greeting="hi" />);
  tiny.registerCommand("hello", { description: "Say hi", handler: () => {} });
};

export default plugin;
`;

const installed = await store.install({ name: "Hello", source: SOURCE });
console.log(`installed ${installed.name} — sha256 ${installed.sha256.slice(0, 12)}`);

// `useState` above is the *app's* useState. Bare specifiers are rewritten to
// the host's own instances, because two copies of React would each carry their
// own dispatcher and every hook in a plugin would throw.
const registry = await loadPlugins([pluginManager(options)]);
console.log(`commands: ${registry.commands.map((command) => command.invocationName).join(", ")}`);
console.log(`overlays: ${registry.contributions.filter((c) => c.slot === "app.overlays").length}`);

// Only what the host offers can be imported by name, and the error says so
// rather than failing at load time with a browser resolution message.
await store
  .install({ name: "Needs lodash", source: 'import _ from "lodash";\nexport default () => _;' })
  .catch((error: unknown) => console.log(`rejected: ${(error as Error).message}`));
```

```
installed Hello — sha256 5bf4302a1cf9
commands: plugins, hello
overlays: 2
rejected: Cannot import "lodash": a plugin may import "react", "react/jsx-runtime", "@tiny/plugin", or an absolute URL.
```

### Installing from a URL, and what tampering costs

`examples/install-from-url.ts`:

```ts path=packages/plugin-manager/examples/install-from-url.ts
import { loadPlugins } from "@tiny/plugin";
import { memoryRoot } from "@tiny/plugin-fs/testing";
import { fetchSource, openInstalled, pluginManager } from "@tiny/plugin-manager";
import { memoryManifest } from "@tiny/plugin-manager/testing";

const SOURCE = 'export default (tiny) => tiny.registerCommand("greet", { handler: () => {} });';

// Stand in for someone's plugin on the web.
const server = Bun.serve({ port: 0, fetch: () => new Response(SOURCE) });
const url = `${server.url.origin}/greet.js`;

const disk = memoryRoot();
const options = { root: () => Promise.resolve(disk), manifest: memoryManifest() };
const store = openInstalled(options);

// Fetching and installing are two steps on purpose: the source is downloaded,
// shown to the user, and only then stored. What runs later is this copy, not
// whatever the URL serves next week — `store.update(id)` re-fetches on demand.
const installed = await store.install({ name: "Greet", source: await fetchSource(url), url });
console.log(`installed from ${installed.url}`);

const registry = await loadPlugins([pluginManager(options)]);
console.log(`commands: ${registry.commands.map((command) => command.invocationName).join(", ")}`);

// The model's filesystem tools point at the same OPFS, so a file under
// /plugins proves nothing. Edit one behind the manifest's back:
const directory = await disk.getDirectoryHandle("plugins");
const writable = await (await directory.getFileHandle(`${installed.id}.js`)).createWritable();
await writable.write('export default () => { console.log("this should never run"); };');
await writable.close();

// The pinned hash no longer matches, so it is reported and skipped.
console.log(`status: ${(await store.inspect())[0]?.status}`);
const afterTamper = await loadPlugins([pluginManager(options)]);
console.log(
  `commands: ${afterTamper.commands.map((command) => command.invocationName).join(", ")}`,
);

server.stop(true);
```

```
installed from http://localhost:PORT/greet.js
commands: plugins, greet
status: modified
[plugin-manager] "Greet" did not load: "Greet" no longer matches the source you approved
commands: plugins
```

## Writing a plugin someone can install

A single module with a default export, TypeScript and JSX included. It receives
the same `tiny` documented in [`@tiny/plugin`](../plugin/README.md):

```tsx
import type { Plugin } from "@tiny/plugin";

const Shout: Plugin = (tiny) => {
  tiny.registerCommand("shout", {
    description: "Send the draft in caps",
    handler: (_args, ctx) => ctx.chat.send(ctx.ui.getEditorText().toUpperCase()),
  });
};

export default Shout;
```

Serve that file from anywhere with permissive CORS — a gist's raw URL, a static
host — and it installs by URL. Publish the source rather than a bundle: the
review step shows the user what it is about to store, and nobody can review a
bundle.

## Tests

```sh
bun test packages/plugin-manager
```

The suite runs against a real in-memory OPFS and a real HTTP server, and really
imports installed source as a module. Nothing is stubbed.
