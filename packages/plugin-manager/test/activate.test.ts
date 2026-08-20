import { beforeEach, describe, expect, test } from "bun:test";
import { loadPlugins } from "@tiny/plugin";
import { memoryRoot } from "@tiny/plugin-fs/testing";
import { memoryManifest } from "../src/inMemoryManifest.ts";
import { type Installed, type InstalledOptions, openInstalled } from "../src/installed.ts";
import { pluginManager } from "../src/plugin.tsx";

/*
 * The point of the package, end to end: source installed at runtime is loaded
 * through the same `loadPlugins` the app uses, and what it registers is
 * indistinguishable from a plugin that shipped with the build.
 */

const HELLO = 'export default (tiny) => tiny.registerCommand("hello", { handler: () => {} });';
const TOOLED = `export default (tiny) =>
  tiny.registerTool({
    name: "dice",
    description: "Roll a die",
    parameters: { type: "object", properties: {} },
    execute: () => "4",
  });`;
const EXPLODES = 'export default () => { throw new Error("boom"); };';

let root: FileSystemDirectoryHandle;
let options: InstalledOptions;
let store: Installed;

beforeEach(() => {
  root = memoryRoot();
  options = { root: () => Promise.resolve(root), manifest: memoryManifest() };
  store = openInstalled(options);
});

const registry = () => loadPlugins([pluginManager(options)]);
const commandNames = async () => (await registry()).commands.map((command) => command.name);

describe("activation", () => {
  test("registers the manager's own command even with nothing installed", async () => {
    expect(await commandNames()).toEqual(["plugins"]);
  });

  test("runs an installed plugin's registrations into the app's registry", async () => {
    await store.install({ name: "Hello", source: HELLO });
    expect(await commandNames()).toEqual(["plugins", "hello"]);
  });

  test("carries tools through to the model", async () => {
    await store.install({ name: "Dice", source: TOOLED });
    expect((await registry()).tools.map((tool) => tool.name)).toEqual(["dice"]);
  });

  test("skips a disabled plugin", async () => {
    const installed = await store.install({ name: "Hello", source: HELLO });
    store.setEnabled(installed.id, false);
    expect(await commandNames()).toEqual(["plugins"]);
  });

  test("refuses source that changed after it was approved", async () => {
    const installed = await store.install({ name: "Hello", source: HELLO });
    const directory = await root.getDirectoryHandle("plugins");
    const writable = await (await directory.getFileHandle(`${installed.id}.js`)).createWritable();
    await writable.write(
      'export default (tiny) => tiny.registerCommand("owned", { handler: () => {} });',
    );
    await writable.close();

    expect(await commandNames()).toEqual(["plugins"]);
  });

  test("keeps loading the rest when one plugin throws", async () => {
    await store.install({ name: "Explodes", source: EXPLODES });
    await store.install({ name: "Hello", source: HELLO });

    expect(await commandNames()).toEqual(["plugins", "hello"]);
  });

  test("the manager is first in line when an installed plugin claims its name", async () => {
    await store.install({
      name: "Impostor",
      source: 'export default (tiny) => tiny.registerCommand("plugins", { handler: () => {} });',
    });
    const { commands } = await registry();

    // A contested name is suffixed in load order for *both* claimants, so
    // `plugins` on its own stops resolving — the manager's becomes `plugins:1`
    // because it registers before any installed plugin runs. The sidebar button
    // and the shortcut call the manager directly rather than by command name,
    // so the way in to remove the impostor survives either way.
    expect(commands.map((command) => command.invocationName)).toEqual(["plugins:1", "plugins:2"]);
    expect(commands[0]?.options.description).toBe("Add and manage plugins");
  });
});
