/**
 * The test environment for every workspace, preloaded by each `bunfig.toml`.
 *
 * One file rather than one per package: the packages differ in what they use,
 * not in what they need available, and a contributor debugging a test should
 * find the environment in a single place.
 */

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
 * Empty every IndexedDB object store after each test.
 *
 * `fake-indexeddb` is one store for the whole process, so without this a test
 * inherits whatever earlier files wrote — `apps/chat`'s conversation store is
 * written by `useChat`'s save path and by the store's own suite, and neither
 * cleans up. Which files ran first depends on file order, which differs between
 * macOS and the Linux CI runner, so the resulting failures reproduce on one and
 * not the other. A sidebar row count is what caught it.
 *
 * Contents are cleared rather than the database deleted, because
 * `deleteDatabase` blocks while any connection is open and `idb-keyval` holds
 * one for the life of the process.
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
