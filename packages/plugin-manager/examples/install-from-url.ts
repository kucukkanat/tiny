import { loadPlugins } from "@tiny/plugin";
import { memoryRoot } from "@tiny/plugin-fs/testing";
import { fetchSource, openInstalled, pluginManager } from "@tiny/plugin-manager";
import { memoryManifest } from "@tiny/plugin-manager/testing";

const SOURCE = 'export default (pi) => pi.registerCommand("greet", { handler: () => {} });';

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
