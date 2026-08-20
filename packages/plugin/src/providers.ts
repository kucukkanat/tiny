import type { Endpoint } from "@tiny/ai";
import type { ProviderConfig, ProviderEntry } from "./types.ts";

/**
 * The registered providers, as live state rather than a snapshot.
 *
 * pi documents `registerProvider` as taking effect in two ways: calls made
 * during the factory are applied when the runner initialises, and calls made
 * later — from a command handler after a setup flow — take effect immediately
 * without a reload. A frozen registry can only do the first, so providers get a
 * store the host subscribes to.
 */
export type ProviderStore = {
  list(): readonly ProviderEntry[];
  register(pluginId: string, id: string, config: ProviderConfig): void;
  unregister(id: string): boolean;
  /** Called before each load, so a factory's registrations do not accumulate. */
  reset(): void;
  subscribe(listener: () => void): () => void;
};

export const createProviderStore = (): ProviderStore => {
  let entries: readonly ProviderEntry[] = [];
  const listeners = new Set<() => void>();
  const announce = () => {
    for (const listener of listeners) listener();
  };

  return {
    list: () => entries,

    register: (pluginId, id, config) => {
      // pi lets a later registration override an earlier one of the same name,
      // which is how an extension replaces a built-in provider.
      entries = [...entries.filter((entry) => entry.id !== id), { id, pluginId, config }];
      announce();
    },

    unregister: (id) => {
      const next = entries.filter((entry) => entry.id !== id);
      if (next.length === entries.length) return false;
      entries = next;
      announce();
      return true;
    },

    reset: () => {
      if (entries.length === 0) return;
      entries = [];
      announce();
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

/**
 * The endpoint a provider streams through.
 *
 * `apiKey` may be a thunk so a plugin can prompt for the key, or read one it
 * stored, without holding it in the registry — which `ctx.settings` would
 * otherwise expose to every other plugin.
 */
export const endpointOf = async (config: ProviderConfig): Promise<Endpoint> => ({
  baseUrl: config.baseUrl,
  apiKey: typeof config.apiKey === "function" ? await config.apiKey() : (config.apiKey ?? ""),
});

/**
 * A provider's models. `models` may be a list or a lookup; omitting it falls
 * back to the endpoint's own `/models` route, which is what an OpenAI-compatible
 * server publishes and therefore the right default.
 */
export const modelsOf = async (
  config: ProviderConfig,
  listModels: (endpoint: Endpoint) => Promise<readonly string[]>,
  signal?: AbortSignal,
): Promise<readonly string[]> => {
  if (Array.isArray(config.models)) return config.models;
  if (typeof config.models === "function") return config.models(signal);
  return listModels(await endpointOf(config));
};
