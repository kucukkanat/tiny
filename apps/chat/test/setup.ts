import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom ships its own fetch stack that can't talk to a local Bun.serve;
// keep Bun's native implementations so integration tests hit real servers.
const native = {
  fetch: globalThis.fetch,
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  AbortController: globalThis.AbortController,
};

GlobalRegistrator.register();
Object.assign(globalThis, native);

// Registered after happy-dom so its indexedDB (an actual spec implementation) wins.
// @ts-expect-error fake-indexeddb's "exports" map hides the types for this entry
await import("fake-indexeddb/auto");
