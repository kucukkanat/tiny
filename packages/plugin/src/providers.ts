import type { Endpoint, ModelOptions } from "@tiny/ai";
import type { ProviderConfig, ProviderEntry, ProviderModel } from "./types.ts";

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
  ...(config.api === undefined ? {} : { api: config.api }),
});

/** The bare id of a model entry, whichever form it was declared in. */
export const modelId = (model: ProviderModel): string =>
  typeof model === "string" ? model : model.id;

/**
 * What `streamChat` needs to know about one model beyond its id.
 *
 * pi lets `api` be set on the provider and overridden per model; the same rule
 * applies here, with the model's own value winning.
 */
export const modelOptions = (config: ProviderConfig, id: string): ModelOptions => {
  const declared = Array.isArray(config.models)
    ? config.models.find((model) => modelId(model) === id)
    : undefined;
  // A bare string carries no metadata of its own; only the object form does.
  const own = typeof declared === "object" ? declared : undefined;
  return {
    api: own?.api ?? config.api,
    ...(own?.reasoning === undefined ? {} : { reasoning: own.reasoning }),
    ...(own?.contextWindow === undefined ? {} : { contextWindow: own.contextWindow }),
    ...(own?.maxTokens === undefined ? {} : { maxTokens: own.maxTokens }),
  };
};

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
  if (Array.isArray(config.models)) return config.models.map(modelId);
  if (typeof config.models === "function") return (await config.models(signal)).map(modelId);
  return listModels(await endpointOf(config));
};
