import type { ManifestStorage } from "./installed.ts";

/** An in-memory manifest, for tests and for scripts running outside a browser. */
export const memoryManifest = (): ManifestStorage => {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
};
