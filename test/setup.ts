/**
 * The test environment for every workspace, preloaded by each `bunfig.toml`.
 *
 * One file rather than one per package: the packages differ in what they use,
 * not in what they need available, and a contributor debugging a test should
 * find the environment in a single place.
 */
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
  GlobalRegistrator.register();
  Object.assign(globalThis, native);
}

// React only flushes `act` work when it knows it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Registered after happy-dom so its indexedDB (an actual spec implementation) wins.
// @ts-expect-error fake-indexeddb's "exports" map hides the types for this entry
await import("fake-indexeddb/auto");
