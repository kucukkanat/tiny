/** The test environment for every workspace, preloaded by each `bunfig.toml`. */

import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom ships its own fetch stack that cannot talk to a local `Bun.serve`;
// keeping Bun's means integration tests hit real servers rather than a shim.
const native = {
  fetch: globalThis.fetch,
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  AbortController: globalThis.AbortController,
};

if (typeof document === "undefined") {
  // A real URL, because no browser app runs at `about:blank` — and a
  // `HashRouter` (which `TinyApp` mounts) cannot parse a location without one.
  GlobalRegistrator.register({ url: "https://tiny.test/" });
  Object.assign(globalThis, native);
}

// React only flushes `act` work when it knows it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Registered after happy-dom so its indexedDB (an actual spec implementation) wins.
// @ts-expect-error fake-indexeddb's "exports" map hides the types for this entry
await import("fake-indexeddb/auto");

/**
 * Empty every IndexedDB store after each test: fake-indexeddb is one store per
 * process, and file order differs between macOS and CI. Cleared rather than
 * deleted — `deleteDatabase` blocks while idb-keyval holds its connection.
 */
afterEach(async () => {
  for (const { name } of await indexedDB.databases()) {
    if (name === undefined) continue;
    await new Promise<void>((resolve) => {
      const opened = indexedDB.open(name);
      opened.onerror = () => resolve();
      opened.onsuccess = () => {
        const db = opened.result;
        const stores = [...db.objectStoreNames];
        const done = () => {
          db.close();
          resolve();
        };
        if (stores.length === 0) return done();
        const tx = db.transaction(stores, "readwrite");
        for (const store of stores) tx.objectStore(store).clear();
        tx.oncomplete = done;
        tx.onerror = done;
      };
    });
  }
});
