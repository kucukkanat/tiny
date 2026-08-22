import type { ProviderStreams } from "@earendil-works/pi-ai";

/** The pi API types that work in a browser — the other three (codex, vertex,
 * bedrock) need Node-only APIs and are left out rather than failing at runtime. */
export const API_TYPES = [
  "openai-completions",
  "openai-responses",
  "azure-openai-responses",
  "anthropic-messages",
  "mistral-conversations",
  "google-generative-ai",
] as const;

export type ApiType = (typeof API_TYPES)[number];

/** What an endpoint speaks when nothing says otherwise. */
export const DEFAULT_API: ApiType = "openai-completions";

export const isApiType = (value: unknown): value is ApiType =>
  typeof value === "string" && (API_TYPES as readonly string[]).includes(value);

// One dynamic import per implementation so code splitting downloads only the api in
// use; paths must stay `@earendil-works/pi-ai/api/*`, never the package root.
const loaders: Record<ApiType, () => Promise<ProviderStreams>> = {
  "openai-completions": async () =>
    (await import("@earendil-works/pi-ai/api/openai-completions.lazy")).openAICompletionsApi(),
  "openai-responses": async () =>
    (await import("@earendil-works/pi-ai/api/openai-responses.lazy")).openAIResponsesApi(),
  "azure-openai-responses": async () =>
    (
      await import("@earendil-works/pi-ai/api/azure-openai-responses.lazy")
    ).azureOpenAIResponsesApi(),
  "anthropic-messages": async () =>
    (await import("@earendil-works/pi-ai/api/anthropic-messages.lazy")).anthropicMessagesApi(),
  "mistral-conversations": async () =>
    (
      await import("@earendil-works/pi-ai/api/mistral-conversations.lazy")
    ).mistralConversationsApi(),
  "google-generative-ai": async () =>
    (await import("@earendil-works/pi-ai/api/google-generative-ai.lazy")).googleGenerativeAIApi(),
};

/** Resolved once per api type; the module cache does the rest. */
const resolved = new Map<ApiType, Promise<ProviderStreams>>();

export const apiFor = (api: ApiType): Promise<ProviderStreams> => {
  const existing = resolved.get(api);
  if (existing !== undefined) return existing;
  const loading = loaders[api]();
  resolved.set(api, loading);
  return loading;
};
