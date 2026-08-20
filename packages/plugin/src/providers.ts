import type { ApiType, Endpoint, ModelSpec } from "@tiny/ai";
import { listModels } from "@tiny/ai";
import { createExternalStore } from "./externalStore.ts";

/* ------------------------------------------------------------------ *
 * Providers — pi's `registerProvider`, reduced to what a browser can hold.
 * ------------------------------------------------------------------ */

/**
 * An OpenAI-compatible endpoint a plugin adds to the model picker.
 *
 * pi's `ProviderConfig` also carries credential storage, catalog persistence
 * and a native `Provider` implementation from `pi-ai`; none has anywhere to
 * live here, and `@tiny/ai` streams to an endpoint directly rather than through
 * pi-ai's provider registry. What remains is the part that actually travels:
 * where to send the request, how to authenticate, and which models exist.
 */
export type ProviderConfig = {
  /** Shown in the model picker. */
  readonly name: string;
  /** e.g. "https://api.groq.com/openai/v1". */
  readonly baseUrl: string;
  /** A key, or a thunk so a plugin can prompt for one instead of storing it. */
  readonly apiKey?: string | (() => string | Promise<string>) | undefined;
  /**
   * Which pi streaming implementation this endpoint speaks. Defaults to
   * `openai-completions`. As in pi, a model may override it.
   */
  readonly api?: ApiType | undefined;
  /**
   * pi's `fetchModels`, narrowed: a fixed list or a lookup. Omit it and the
   * endpoint's own models route is used, which is what most servers publish.
   *
   * An entry may be a bare id, or an object carrying what the endpoint cannot
   * publish about it — its api, whether it reasons, its window.
   */
  readonly models?:
    | readonly ProviderModel[]
    | ((signal: AbortSignal | undefined) => Promise<readonly ProviderModel[]>)
    | undefined;
};

/** A model id, or an id with the metadata a bare `/models` route cannot carry. */
export type ProviderModel = string | ({ readonly id: string } & ModelSpec);

export type ProviderEntry = {
  readonly id: string;
  readonly pluginId: string;
  readonly config: ProviderConfig;
};

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
  const entries = createExternalStore<readonly ProviderEntry[]>([]);

  return {
    list: entries.get,
    subscribe: entries.subscribe,

    register: (pluginId, id, config) =>
      // pi lets a later registration override an earlier one of the same name,
      // which is how an extension replaces a built-in provider.
      entries.set([...entries.get().filter((entry) => entry.id !== id), { id, pluginId, config }]),

    unregister: (id) => {
      const next = entries.get().filter((entry) => entry.id !== id);
      if (next.length === entries.get().length) return false;
      entries.set(next);
      return true;
    },

    reset: () => {
      if (entries.get().length > 0) entries.set([]);
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
export const modelSpec = (config: ProviderConfig, id: string): ModelSpec => {
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
  signal?: AbortSignal,
): Promise<readonly string[]> => {
  if (Array.isArray(config.models)) return config.models.map(modelId);
  if (typeof config.models === "function") return (await config.models(signal)).map(modelId);
  return listModels(await endpointOf(config));
};
