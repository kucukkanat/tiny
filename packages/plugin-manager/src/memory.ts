import type { ManifestStorage } from "./store.ts";

/**
 * An in-memory manifest, for tests and for scripts running outside a browser.
 *
 * The source side already has one — `@tiny/plugin-fs/memory` provides a real
 * in-memory OPFS root — so the two together let the whole store run under Bun
 * with nothing stubbed.
 */
export const memoryManifest = (): ManifestStorage => {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
};
