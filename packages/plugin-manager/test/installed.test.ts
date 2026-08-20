import { beforeEach, describe, expect, test } from "bun:test";
import { memoryRoot } from "@tiny/plugin-fs/testing";
import { compile } from "../src/compile.ts";
import { PluginManagerError } from "../src/errors.ts";
import { memoryManifest } from "../src/inMemoryManifest.ts";
import { fetchSource, type Installed, openInstalled, sha256 } from "../src/installed.ts";

// The store runs against a real in-memory OPFS and a real manifest — nothing is
// stubbed, and `compile` really imports the source as a module.

const HELLO = 'export default (tiny) => tiny.registerCommand("hello", { handler: () => {} });';

let root: FileSystemDirectoryHandle;
let store: Installed;

beforeEach(() => {
  root = memoryRoot();
  store = openInstalled({
    root: () => Promise.resolve(root),
    manifest: memoryManifest(),
    now: () => "2026-08-20T00:00:00.000Z",
  });
});

/** Reaches past the store to the file it wrote, the way a stray tool would. */
const sourceFile = async (id: string) =>
  (await root.getDirectoryHandle("plugins")).getFileHandle(`${id}.js`);

const overwrite = async (id: string, text: string) => {
  const writable = await (await sourceFile(id)).createWritable();
  await writable.write(text);
  await writable.close();
};

describe("install", () => {
  test("writes the source, pins its hash and enables it", async () => {
    const installed = await store.install({ name: "Hello", source: HELLO });

    expect(installed.name).toBe("Hello");
    expect(installed.enabled).toBe(true);
    expect(installed.url).toBeUndefined();
    expect(installed.addedAt).toBe("2026-08-20T00:00:00.000Z");
    expect(installed.sha256).toBe(await sha256(HELLO));
    expect(store.list()).toEqual([installed]);
    expect(await (await (await sourceFile(installed.id)).getFile()).text()).toBe(HELLO);
  });

  test("trims the name and refuses an empty one", async () => {
    const installed = await store.install({ name: "  Spaced  ", source: HELLO });
    expect(installed.name).toBe("Spaced");
    await expect(store.install({ name: "   ", source: HELLO })).rejects.toThrow(PluginManagerError);
  });

  test("refuses an empty source", async () => {
    await expect(store.install({ name: "Empty", source: "  \n " })).rejects.toThrow(
      "The source is empty",
    );
  });

  test("refuses source that is not a module, leaving nothing behind", async () => {
    await expect(store.install({ name: "Broken", source: "export default (" })).rejects.toThrow(
      PluginManagerError,
    );
    expect(store.list()).toEqual([]);
  });

  test("refuses a module without a default plugin function", async () => {
    await expect(
      store.install({ name: "No default", source: "export const x = 1;" }),
    ).rejects.toThrow("must `export default` a function");
  });
});

describe("inspect", () => {
  test("reports a plugin whose source still matches as ok", async () => {
    await store.install({ name: "Hello", source: HELLO });
    expect((await store.inspect())[0]?.status).toBe("ok");
  });

  test("reports source edited behind the manifest's back as modified", async () => {
    const installed = await store.install({ name: "Hello", source: HELLO });
    await overwrite(installed.id, "export default () => { globalThis.owned = true; };");

    expect((await store.inspect())[0]?.status).toBe("modified");
    await expect(store.verifiedSource(installed)).rejects.toThrow("no longer matches");
  });

  test("reports a deleted source as missing", async () => {
    const installed = await store.install({ name: "Hello", source: HELLO });
    await (await root.getDirectoryHandle("plugins")).removeEntry(`${installed.id}.js`);

    expect((await store.inspect())[0]?.status).toBe("missing");
    await expect(store.verifiedSource(installed)).rejects.toThrow("no source on disk");
  });

  test("survives a manifest that is not an array", async () => {
    const manifest = memoryManifest();
    manifest.setItem("tiny:plugins", '"nonsense"');
    expect(openInstalled({ root: () => Promise.resolve(root), manifest }).list()).toEqual([]);
  });

  test("survives a manifest that is not JSON", () => {
    const manifest = memoryManifest();
    manifest.setItem("tiny:plugins", "{oops");
    expect(openInstalled({ root: () => Promise.resolve(root), manifest }).list()).toEqual([]);
  });
});

describe("enable, remove", () => {
  test("toggles enabled and keeps the rest of the entry", async () => {
    const installed = await store.install({ name: "Hello", source: HELLO });
    store.setEnabled(installed.id, false);
    expect(store.list()[0]).toEqual({ ...installed, enabled: false });
  });

  test("removes the manifest entry and the file", async () => {
    const installed = await store.install({ name: "Hello", source: HELLO });
    await store.remove(installed.id);

    expect(store.list()).toEqual([]);
    await expect(sourceFile(installed.id)).rejects.toThrow();
  });

  test("removing twice is not an error the second time", async () => {
    const installed = await store.install({ name: "Hello", source: HELLO });
    await store.remove(installed.id);
    await expect(store.remove(installed.id)).rejects.toThrow("No installed plugin");
  });

  test("rejects an unknown id", () => {
    expect(() => store.setEnabled("nope", true)).toThrow("No installed plugin with id nope");
  });
});

describe("fetching", () => {
  test("rejects a URL that is not http(s)", async () => {
    await expect(fetchSource("file:///etc/passwd")).rejects.toThrow("Only http(s) URLs");
  });

  test("rejects text that is not a URL", async () => {
    await expect(fetchSource("not a url")).rejects.toThrow("Not a valid URL");
  });

  test("downloads source and re-pins it on update", async () => {
    let served = HELLO;
    const server = Bun.serve({
      port: 0,
      fetch: (request) =>
        new URL(request.url).pathname === "/plugin.js"
          ? new Response(served, { headers: { "content-type": "text/javascript" } })
          : new Response("nope", { status: 404 }),
    });
    const url = `${server.url.origin}/plugin.js`;

    try {
      expect(await fetchSource(url)).toBe(HELLO);
      await expect(fetchSource(`${server.url.origin}/missing.js`)).rejects.toThrow("responded 404");

      const installed = await store.install({
        name: "Remote",
        source: await fetchSource(url),
        url,
      });
      served = `${HELLO}\n// v2`;
      const updated = await store.update(installed.id);

      expect(updated.sha256).toBe(await sha256(served));
      expect(updated.id).toBe(installed.id);
      expect(updated.addedAt).toBe(installed.addedAt);
      expect((await store.inspect())[0]?.status).toBe("ok");
      expect(await store.verifiedSource(updated)).toBe(served);
    } finally {
      server.stop(true);
    }
  });

  test("refuses to update a pasted plugin", async () => {
    const installed = await store.install({ name: "Hello", source: HELLO });
    await expect(store.update(installed.id)).rejects.toThrow("nothing to update");
  });
});

describe("compile", () => {
  test("returns the module's default export as a plugin", async () => {
    const registered: string[] = [];
    const plugin = await compile(HELLO);
    await plugin({
      registerCommand: (name: string) => registered.push(name),
    } as never);
    expect(registered).toEqual(["hello"]);
  });
});

describe("update", () => {
  test("applies the source the user reviewed, not whatever the URL serves now", async () => {
    // The gap this closes: `Update` used to re-fetch and run, so what executed
    // was never the code anyone was shown.
    let served = 'export default (tiny) => tiny.registerCommand("v1", { handler: () => {} });';
    const server = Bun.serve({ port: 0, fetch: () => new Response(served) });
    try {
      const installed = await store.install({
        name: "Greet",
        source: served,
        url: `${server.url.origin}/p.js`,
      });

      // The user fetches and reviews this…
      const reviewed =
        'export default (tiny) => tiny.registerCommand("v2", { handler: () => {} });';
      // …while the URL quietly starts serving something else.
      served = 'export default (tiny) => tiny.registerCommand("evil", { handler: () => {} });';

      const after = await store.update(installed.id, reviewed);

      expect(after.sha256).toBe(await sha256(reviewed));
      expect(await store.verifiedSource(after)).toBe(reviewed);
    } finally {
      server.stop(true);
    }
  });
});
