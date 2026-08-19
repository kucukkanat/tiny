import type { Model } from "@earendil-works/pi-ai";
import { ChatApiError, type Endpoint } from "./types.ts";

/** Tags models as coming from the user's endpoint rather than a known provider. */
export const PROVIDER_ID = "endpoint";

const API = "openai-completions";

const trimBase = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

/**
 * Describe one model on the user's endpoint. An arbitrary OpenAI-compatible
 * server publishes nothing but an id, so the metadata below is a placeholder:
 * pi-ai uses it for display and cost reporting and never derives request
 * parameters from it (`max_tokens` is only sent when a caller asks for it).
 */
export const endpointModel = (endpoint: Endpoint, id: string): Model<typeof API> => ({
  id,
  name: id,
  api: API,
  provider: PROVIDER_ID,
  baseUrl: trimBase(endpoint.baseUrl),
  // Left false so pi-ai never adds `reasoning_effort`, which servers like Ollama
  // and vLLM reject. Reasoning deltas are parsed regardless of this flag.
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  // Unknown for a bring-your-own endpoint; nothing in this app reads them.
  contextWindow: 0,
  maxTokens: 0,
});

type ModelsPayload = { data?: readonly { id?: string }[] };

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

/** Read the model ids the endpoint advertises on its `/models` route. */
export async function fetchModelIds(
  endpoint: Endpoint,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const response = await fetch(`${trimBase(endpoint.baseUrl)}/models`, {
    headers: { Authorization: `Bearer ${endpoint.apiKey}` },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) await throwApiError(response);
  const payload = (await response.json()) as ModelsPayload;
  return (payload.data ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === "string");
}
