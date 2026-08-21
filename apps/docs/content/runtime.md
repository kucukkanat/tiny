# How runtime plugins work

A **runtime plugin** is code the build never saw. You paste it, or point the app
at a URL, and it runs from the next moment on — no rebuild, no page reload, and
no reduction in what it can do. Its commands, tools, shortcuts and slot
contributions land in exactly the same registry as the plugins that shipped in the
bundle.

This page is how that is possible, what it costs, and what guards it.

## It is a plugin, all the way down

There is no runtime-plugin subsystem in the host. `@tiny/plugin-manager` is an
**ordinary plugin** — it appears in the app's registry alongside every other one:

```ts
export const plugins: readonly IdentifiedPlugin[] = [
  // …the plugins that ship with the build…

  // Lets the user install further plugins at runtime, from a URL or pasted
  // source. Last, so the plugins that shipped claim their command names first.
  pluginManager(),
];
```

What makes it different is one word:

```ts
return async (tiny) => {
  tiny.registerCommand("plugins", { description: "Add and manage plugins", handler: () => open.set(true) });
  tiny.registerShortcut("super+shift+p", { description: "Manage plugins", handler: () => open.set(true) });
  tiny.registerShortcut("ctrl+shift+p", { description: "Manage plugins", handler: () => open.set(true) });
  tiny.contribute("app.overlays", ManagerOverlay);
  tiny.contribute("sidebar.footer", ManagerButton);

  activator = createActivator(store, tiny);
  await activator.apply();
};
```

`loadPlugins` **awaits every factory**. This one is `async`, so before it returns
it has read the manifest, imported each installed plugin as a module, and called
it with **the same `tiny` object** it was handed. Whatever those plugins register is
recorded in the same arrays, in the same pass, by the same code.

That is the entire mechanism. Nothing in `@tiny/plugin` knows that runtime
plugins exist.

> **They share the manager's identity.** `tiny` carries the id `loadPlugins` gave
> `pluginManager`, so every installed plugin's `ctx.storage` writes under
> `tiny-plugin:pluginManager:` and its errors are labelled with the manager's
> name. Two installed plugins that both store `"state"` overwrite each other,
> and — same cause — two that both register a [panel](panels.md) called `"notes"`
> collapse into one, because a panel's id is namespaced by the plugin's.
> Scoping them needs `loadPlugins` to hand out a per-plugin `tiny`, which it does
> not do yet.

```text
loadPlugins([settings(), fileSystem(), pluginManager()])
│
├─ settings(tiny)              registers: /settings, app.overlays
├─ fileSystem(tiny)            registers: fs_read, fs_write, …
└─ pluginManager(tiny)   async
   │  registers: /plugins, ⌘⇧P, app.overlays, sidebar.footer
   │
   └─ activator.apply()
      ├─ read manifest from localStorage
      ├─ for each enabled entry:
      │    read source from OPFS  →  hash it  →  compare to the pinned hash
      │    ↓ matches
      │    compile(source)  →  blob URL  →  dynamic import  →  default export
      │    ↓
      │    await plugin(tiny)   ← the same tiny
      └─ resolve
   ↓
Registry { commands, shortcuts, tools, contributions, extensions }
```

## Turning a string into a plugin

```ts
export const compile = async (source: string): Promise<Plugin> => {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try {
    const module: unknown = await import(/* @vite-ignore */ url).catch(…);
    const factory = (module as { default?: unknown }).default;
    if (typeof factory !== "function")
      throw new PluginManagerError("A plugin module must `export default` a function");
    return factory as Plugin;
  } finally {
    URL.revokeObjectURL(url);
  }
};
```

A blob URL and a dynamic `import`, which is to say: **a real ES module**. It gets
module scope, top-level `await`, and `import` of anything the page can reach.
There is no `eval`, no `new Function`, and no wrapper narrowing what the source
may do — a runtime plugin is not a lesser kind of plugin.

Two things are rejected here, before the source is ever stored: a module that
fails to parse or evaluate, and a module without a function as its default export.

## Where it is stored, and why in two places

| | Where | Reachable by |
| --- | --- | --- |
| Source | OPFS, `/plugins/<id>.js` | the page, **and the model's `@tiny/plugin-fs` tools** |
| Manifest — name, URL, approved SHA-256, enabled, addedAt | `localStorage`, key `tiny:plugins` | the page only |

The split is the security design, not a filing convenience.

If [`@tiny/plugin-fs`](tools.md#a-worked-example) is enabled, the model can write
files into the very directory plugin sources live in. So **a file being there
grants it nothing.** A plugin runs only if the manifest has an entry for it *and*
the file still hashes to the value recorded in that entry.

## The manifest is the trust boundary

Every load goes through one function:

```ts
verifiedSource: async (installed) => {
  const source = await readSource(installed.id);
  if (source === undefined)
    throw new PluginManagerError(`"${installed.name}" has no source on disk`);
  if ((await sha256(source)) !== installed.sha256)
    throw new PluginManagerError(`"${installed.name}" no longer matches the source you approved`);
  return source;
},
```

`store.inspect()` reports the same check as a status:

| Status | Means | Runs? |
| --- | --- | --- |
| `ok` | the file hashes to the pinned value | yes |
| `modified` | the file changed behind the manifest's back | no |
| `missing` | the manifest has an entry, the file is gone | no |

A plugin that throws during activation is **reported and skipped**, never fatal:

```
[plugin-manager] "Greet" did not load: "Greet" no longer matches the source you approved
```

One bad plugin must not cost you the others, and must never cost you the manager
dialog you need in order to remove it.

## Disabling and reloading

Adding, enabling, disabling and removing used to end the same way — `ctx.reload()`,
re-running **every** factory in the app to change one checkbox, because a
registration could not be taken back.

It can now. Each `register*` hands back a disposer, and the manager keeps the
ones each installed plugin produced, so it reconciles what is running against
the manifest instead:

- **disabled or removed** → its disposers run, and its commands, tools,
  shortcuts and contributions go with them;
- **enabled** → its source is compiled and run against the same `tiny`;
- **updated** → the old revision is stopped before the new one starts, so it
  releases its command names first;
- **unchanged** → left alone entirely.

Nothing else in the app is disturbed. The settings dialog, the filesystem tools
and the approval gate do not re-run because you toggled a checkbox.

`ctx.reload()` is still there and still rebuilds from scratch. It is the right
tool when the plugin *list* changed rather than one plugin's state, and it is
what a plugin calls when it wants the whole registry rebuilt.

## Adding a plugin

Press `⌘⇧P` / `Ctrl+Shift+P`, click **Plugins** in the sidebar footer, or type
`/plugins`.

**By URL.** The source is fetched, shown in full for approval, and only then
stored. What runs later is *that stored copy*, so an upstream edit cannot change
what your browser executes. `Update` re-fetches and re-pins on demand. `http(s)`
only — a `file:` or `data:` URL is refused.

**By paste.** The same review step, with no URL to update from.

Either way, `install` compiles the source before writing a byte of it, so
anything that is not a loadable module with a default export is rejected at the
door.

## The trust boundary

**An installed plugin is not sandboxed.** It gets module scope in your page, the
same `ctx` your own plugins get, and through it your conversations, your
[settings including the API key](context.md#settings-and-navigation), and the
ability to render into the UI.

It cannot be otherwise — that is what a plugin *is*. A sandbox that withheld any
of it would also break every legitimate plugin on this site.

So the guarantees are precise, and worth stating as precisely:

| Guaranteed | Not guaranteed |
| --- | --- |
| What runs is byte-for-byte what you approved | that what you approved is safe |
| An upstream URL cannot change it afterwards | that it was safe when you fetched it |
| A file written into OPFS by the model cannot run | that an approved plugin will not misbehave |
| Disabling stops it completely, at once | that it did nothing while enabled |

The dialog shows you the full source and its SHA-256 before anything is written,
because **that review is the whole trust boundary**. Only add code you would run
yourself.

## Writing an installable plugin

A single module with a default export, in TypeScript and JSX if you want them.
It receives the same `tiny` documented throughout this site:

```tsx
import type { Plugin } from "@tiny/plugin";
import { useState } from "react";

const Shout: Plugin = (tiny) => {
  tiny.registerCommand("shout", {
    description: "Send the draft in caps",
    handler: (_args, ctx) => ctx.chat.send(ctx.ui.getEditorText().toUpperCase()),
  });
};

export default Shout;
```

Constraints worth knowing before you write one:

- **Default export, and it must be a function.** A named export is not found.
- **TypeScript and JSX are compiled in the browser**, at install time, by
  [sucrase](https://github.com/alangpierce/sucrase) — 47 KB gzipped, in its own
  chunk, fetched on the first compile. A visitor with nothing installed never
  downloads it. Plain JavaScript passes through byte-for-byte unchanged.
- **Types are stripped, not checked.** There is no typechecker in the browser and
  no `node_modules` to check against. Your editor is the only thing that will
  tell you a type is wrong; the app will happily run code that does not typecheck.
- **Only the host's modules can be imported by name.** `react`,
  `react/jsx-runtime` and `@tiny/plugin` everywhere; this app adds `@tiny/ui`.
  Each resolves to the app's *own* instance — that is what makes hooks work,
  since a second copy of React would carry its own dispatcher and throw. Anything
  else is refused at install time, with the list of what is allowed. Import from
  an absolute URL if you need more.
- **One file.** A blob URL has no directory, so a relative import has nothing to
  resolve against. That is refused at install time too.
- **The factory may be `async`**, and `loadPlugins` will await it. Keep it quick:
  every other plugin behind it in the list is waiting.

Since the compiler runs at install, a syntax error, an unknown import or a
module without a plugin export is caught while the user is still looking at the
dialog — nothing is written to storage. It also means what gets pinned and
reviewed is the source you wrote, not a bundle nobody can read.

See [Publishing a plugin](publishing.md) for naming, CORS and distribution.

## Driving it from code

Everything the dialog uses is exported, so installs can be scripted:

```ts
import { openInstalled, fetchSource } from "@tiny/plugin-manager";

const store = openInstalled(); // localStorage + OPFS by default

await store.install({ name: "Greet", source: await fetchSource(url), url });
await store.inspect();        // entries with status: "ok" | "modified" | "missing"
store.setEnabled(id, false);
await store.update(id);       // re-fetch a URL-installed plugin
await store.remove(id);
```

`openInstalled({ root, manifest, now })` swaps the OPFS root, the manifest storage
and the clock. `@tiny/plugin-manager/testing` and `@tiny/plugin-fs/testing` provide
in-memory implementations of the first two, which is how the following example
runs outside a browser at all.

### End to end, in one file

This is `packages/plugin-manager/examples/install-from-source.ts`, executed by the
test suite:

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

// Disabling is immediate — the plugin's disposers run and the command is gone.
store.setEnabled(installed.id, false);
const withoutIt = await loadPlugins([pluginManager(options)]);
console.log(`disabled: ${withoutIt.commands.map((command) => command.invocationName).join(", ")}`);
```

```text
installed Word count — sha256 cca4ea0c643a
commands: plugins, words
disabled: plugins
```

### What tampering costs

The same example, from a URL, with the source edited behind the manifest's back —
exactly what the model's filesystem tools could do:

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

```text
installed from http://localhost:PORT/greet.js
commands: plugins, greet
status: modified
[plugin-manager] "Greet" did not load: "Greet" no longer matches the source you approved
commands: plugins
```

## Failure reference

| Situation | What happens |
| --- | --- |
| Source does not parse | rejected at install; nothing is written |
| Module has no default export, or it is not a function | rejected at install |
| URL is not `http(s)` | `PluginManagerError` before any fetch |
| URL is unreachable or non-`2xx` | `PluginManagerError`, with the status |
| Source edited after install | status `modified`; skipped with a console error |
| Source deleted after install | status `missing`; skipped with a console error |
| Factory throws during activation | logged, skipped; other plugins still load |
| Manifest JSON is corrupt | treated as empty — every runtime plugin is disabled rather than guessed at |
| Command name collides with a bundled plugin | both kept, suffixed `:1` / `:2` in load order |
| Tool name collides | first registration wins; the clash is logged |
| `update` on a pasted plugin | `PluginManagerError` — there is no URL to update from |
