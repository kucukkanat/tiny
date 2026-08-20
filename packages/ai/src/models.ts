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
  /**
   * Whether to let pi-ai send reasoning parameters. Off by default because
   * servers like Ollama and vLLM reject `reasoning_effort`; reasoning deltas are
   * parsed regardless of this flag.
   */
  readonly reasoning?: boolean | undefined;
  readonly contextWindow?: number | undefined;
  readonly maxTokens?: number | undefined;
};

/**
 * Describe one model on an endpoint. An arbitrary server publishes nothing but
 * an id, so the metadata below defaults to placeholders: pi-ai uses it for
 * display and cost reporting and never derives request parameters from it
 * (`max_tokens` is only sent when a caller asks for it). A provider that knows
 * better can say so through `ModelSpec`.
 */
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

/**
 * Whether an endpoint's base URL is expected to carry the version segment.
 *
 * This is not a style choice — it follows what each implementation does with
 * `model.baseUrl`. The OpenAI SDK appends `/chat/completions` to it and Google
 * is handed `apiVersion: ""` because "baseUrl already includes version path", so
 * both want the version in the base. The Anthropic SDK appends `/v1/messages`
 * and Mistral resolves `v1/chat/completions` against it, so those two must not.
 */
const VERSION_IN_PATH: Record<ApiType, string> = {
  "openai-completions": "",
  "openai-responses": "",
  "azure-openai-responses": "",
  "google-generative-ai": "",
  "anthropic-messages": "/v1",
  "mistral-conversations": "/v1",
};

/**
 * How each API family asks for its model list.
 *
 * The route and the auth header differ per family even though most of the
 * response shapes agree, so this is the one place that knows the difference.
 */
const modelsRequest = (
  endpoint: Endpoint,
  api: ApiType,
): { url: string; headers: Record<string, string> } => {
  const base = trimBase(endpoint.baseUrl) + VERSION_IN_PATH[api];
  switch (api) {
    case "anthropic-messages":
      return {
        url: `${base}/models`,
        // Anthropic authenticates with `x-api-key`, and versions its API through
        // a header rather than the path. Without the third header it refuses a
        // cross-origin request outright.
        headers: {
          "x-api-key": endpoint.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      };
    case "google-generative-ai":
      // Google takes the key in the query string and returns `models/<id>`.
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
      : // Google qualifies every id as `models/gemini-…`; the bare id is what a
        // request wants back.
        payload.models.map((entry) => entry.name?.replace(/^models\//, ""));
  return ids.filter((id): id is string => typeof id === "string");
}
