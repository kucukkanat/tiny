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
