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
    "export default (pi) => {",
    '  pi.registerCommand("words", {',
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
