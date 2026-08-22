import type { Api, Model } from "@earendil-works/pi-ai";
import { type ApiType, DEFAULT_API } from "./apis.ts";
import type { Endpoint } from "./chat.ts";
import { ChatApiError } from "./errors.ts";

/** Tags models as coming from the user's endpoint rather than a known provider. */
export const PROVIDER_ID = "endpoint";

const trimBase = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

/** Per-model metadata an endpoint cannot publish and a provider may know. */
export type ModelSpec = {
  /** Which pi streaming implementation to talk to. */
  readonly api?: ApiType | undefined;
  /** Off by default: servers like Ollama reject `reasoning_effort`. Deltas parse regardless. */
  readonly reasoning?: boolean | undefined;
  readonly contextWindow?: number | undefined;
  readonly maxTokens?: number | undefined;
};

/** Describe one model on an endpoint. Metadata defaults to placeholders —
 * pi-ai never derives request parameters from it. */
export const endpointModel = (
  endpoint: Endpoint,
  id: string,
  options: ModelSpec = {},
): Model<Api> => ({
  id,
  name: id,
  api: (options.api ?? endpoint.api ?? DEFAULT_API) as Api,
  provider: PROVIDER_ID,
  baseUrl: trimBase(endpoint.baseUrl),
  reasoning: options.reasoning ?? false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: options.contextWindow ?? 0,
  maxTokens: options.maxTokens ?? 0,
});

/** OpenAI, Anthropic and Mistral all answer `{ data: [{ id }] }`; Google does not. */
type ModelsPayload = {
  data?: readonly { id?: string }[];
  models?: readonly { name?: string }[];
};

// Follows each SDK's use of `model.baseUrl`: OpenAI and Google want the version
// in the base; the Anthropic and Mistral SDKs append it themselves.
const VERSION_IN_PATH: Record<ApiType, string> = {
  "openai-completions": "",
  "openai-responses": "",
  "azure-openai-responses": "",
  "google-generative-ai": "",
  "anthropic-messages": "/v1",
  "mistral-conversations": "/v1",
};

/** The models route and auth header, which differ per API family. */
const modelsRequest = (
  endpoint: Endpoint,
  api: ApiType,
): { url: string; headers: Record<string, string> } => {
  const base = trimBase(endpoint.baseUrl) + VERSION_IN_PATH[api];
  switch (api) {
    case "anthropic-messages":
      return {
        url: `${base}/models`,
        // Without the third header Anthropic refuses a cross-origin request outright.
        headers: {
          "x-api-key": endpoint.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      };
    case "google-generative-ai":
      // Google takes the key in the query string.
      return { url: `${base}/models?key=${encodeURIComponent(endpoint.apiKey)}`, headers: {} };
    default:
      return { url: `${base}/models`, headers: { Authorization: `Bearer ${endpoint.apiKey}` } };
  }
};

/** Fail with the server's own message, unwrapping `{ error: { message } }`. */
async function throwApiError(response: Response): Promise<never> {
  const body = await response.text().catch(() => "");
  let message = body || response.statusText;
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof parsed.error === "object" &&
      parsed.error !== null &&
      "message" in parsed.error &&
      typeof parsed.error.message === "string"
    ) {
      message = parsed.error.message;
    }
  } catch {
    // not JSON — keep the raw text
  }
  throw new ChatApiError(message, response.status);
}

/** Read the model ids the endpoint advertises on its models route. */
export async function fetchModelIds(
  endpoint: Endpoint,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const { url, headers } = modelsRequest(endpoint, endpoint.api ?? DEFAULT_API);
  const response = await fetch(url, { headers, ...(signal ? { signal } : {}) });
  if (!response.ok) await throwApiError(response);
  const payload = (await response.json()) as ModelsPayload;
  const ids =
    payload.models === undefined
      ? (payload.data ?? []).map((entry) => entry.id)
      : // Google qualifies ids as `models/…`; a request wants the bare id back.
        payload.models.map((entry) => entry.name?.replace(/^models\//, ""));
  return ids.filter((id): id is string => typeof id === "string");
}
