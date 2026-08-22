import type { ApiType, Endpoint, ModelSpec } from "@tiny/ai";
import { listModels } from "@tiny/ai";
import { createExternalStore } from "./externalStore.ts";

/* ------------------------------------------------------------------ *
 * Providers — pi's `registerProvider`, reduced to what a browser can hold.
 * ------------------------------------------------------------------ */

/** An OpenAI-compatible endpoint a plugin adds to the model picker — pi's `ProviderConfig`,
 * reduced to where to send the request, how to authenticate, and which models exist. */
export type ProviderConfig = {
  /** Shown in the model picker. */
  readonly name: string;
  /** e.g. "https://api.groq.com/openai/v1". */
  readonly baseUrl: string;
  /** A key, or a thunk so a plugin can prompt for one instead of storing it. */
  readonly apiKey?: string | (() => string | Promise<string>) | undefined;
  /** Which pi streaming implementation this endpoint speaks; defaults to `openai-completions`, a model may override. */
  readonly api?: ApiType | undefined;
  /** A fixed list or a lookup; omit it and the endpoint's own `/models` route is used. */
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

/** The registered providers as live state: pi allows `registerProvider` after the factory returns. */
export type ProviderStore = {
  list(): readonly ProviderEntry[];
  register(pluginId: string, id: string, config: ProviderConfig): void;
  unregister(id: string): boolean;
  /** Drops every provider one plugin registered, for when that plugin is retired. */
  removeOwner(pluginId: string): boolean;
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
      // A later registration overrides an earlier one of the same name, as in pi.
      entries.set([...entries.get().filter((entry) => entry.id !== id), { id, pluginId, config }]),

    unregister: (id) => {
      const next = entries.get().filter((entry) => entry.id !== id);
      if (next.length === entries.get().length) return false;
      entries.set(next);
      return true;
    },

    removeOwner: (pluginId) => {
      const next = entries.get().filter((entry) => entry.pluginId !== pluginId);
      if (next.length === entries.get().length) return false;
      entries.set(next);
      return true;
    },

    reset: () => {
      if (entries.get().length > 0) entries.set([]);
    },
  };
};

/** The endpoint a provider streams through; `apiKey` may be a thunk so the key never sits in the registry. */
export const endpointOf = async (config: ProviderConfig): Promise<Endpoint> => ({
  baseUrl: config.baseUrl,
  apiKey: typeof config.apiKey === "function" ? await config.apiKey() : (config.apiKey ?? ""),
  ...(config.api === undefined ? {} : { api: config.api }),
});

/** The bare id of a model entry, whichever form it was declared in. */
export const modelId = (model: ProviderModel): string =>
  typeof model === "string" ? model : model.id;

/** What `streamChat` needs to know about one model beyond its id; the model's own `api` wins over the provider's. */
export const modelSpec = (config: ProviderConfig, id: string): ModelSpec => {
  const declared = Array.isArray(config.models)
    ? config.models.find((model) => modelId(model) === id)
    : undefined;
  const own = typeof declared === "object" ? declared : undefined;
  return {
    api: own?.api ?? config.api,
    ...(own?.reasoning === undefined ? {} : { reasoning: own.reasoning }),
    ...(own?.contextWindow === undefined ? {} : { contextWindow: own.contextWindow }),
    ...(own?.maxTokens === undefined ? {} : { maxTokens: own.maxTokens }),
  };
};

/** A provider's models: the declared list or lookup, else the endpoint's own `/models` route. */
export const modelsOf = async (
  config: ProviderConfig,
  signal?: AbortSignal,
): Promise<readonly string[]> => {
  if (Array.isArray(config.models)) return config.models.map(modelId);
  if (typeof config.models === "function") return (await config.models(signal)).map(modelId);
  return listModels(await endpointOf(config));
};
