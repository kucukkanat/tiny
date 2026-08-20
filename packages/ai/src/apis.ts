import type { ProviderStreams } from "@earendil-works/pi-ai";

/**
 * The pi API types that work in a browser.
 *
 * pi ships nine streaming implementations. Six reach a page; the other three
 * cannot, and are left out rather than failing at runtime:
 *
 * | Left out | Why |
 * | --- | --- |
 * | `openai-codex-responses` | imports `node:zlib` |
 * | `google-vertex` | signs a service-account JWT through `GoogleAuth` |
 * | `bedrock-converse-stream` | transports over `@smithy/node-http-handler` |
 *
 * Of the six below, four go through a vendor SDK that pi-ai already configures
 * for browser use — it passes `dangerouslyAllowBrowser` and, for Anthropic, the
 * `anthropic-dangerous-direct-browser-access` header that makes Anthropic answer
 * a cross-origin request at all. `mistral-conversations` uses plain `fetch`.
 */
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

/**
 * Each implementation is behind its own dynamic import, so a bundler with code
 * splitting downloads only the one an endpoint actually uses — the Anthropic SDK
 * never reaches a reader who only ever talks to a local Ollama.
 *
 * pi-ai's `.lazy` wrappers defer the vendor SDK a second time, on the first
 * request. See "Browser notes" in the README for why these paths are always
 * `@earendil-works/pi-ai/api/*` and never the package root.
 */
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
