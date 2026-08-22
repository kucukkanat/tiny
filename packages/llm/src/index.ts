import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { streamText } from 'ai'

import type { Provider } from './provider'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

/** Anthropic rejects browser calls unless the caller opts in. */
const browserHeaders = { 'anthropic-dangerous-direct-browser-access': 'true' }

const modelFor = (p: Provider, id: string) =>
  p.kind === 'anthropic'
    ? createAnthropic({ baseURL: p.baseUrl, apiKey: p.apiKey, headers: browserHeaders })(id)
    : createOpenAICompatible({ name: p.kind, baseURL: p.baseUrl, apiKey: p.apiKey })(id)

/** The SDK's own message is generic; the provider's response body says what actually went wrong. */
const describe = (e: any) =>
  [e?.statusCode, e?.responseBody ?? e?.message ?? String(e)].filter(Boolean).join(' — ').slice(0, 300)

/** Streams the assistant reply as text deltas. */
export async function* streamChat(
  p: Provider,
  req: { model: string; messages: ChatMessage[]; signal?: AbortSignal },
): AsyncGenerator<string> {
  let failure: unknown
  const { textStream } = streamText({
    model: modelFor(p, req.model),
    messages: req.messages,
    abortSignal: req.signal,
    // streamText reports a failed request here rather than throwing from the stream,
    // so without this a bad key ends the reply silently.
    onError: ({ error }) => {
      failure = error
    },
  })
  for await (const delta of textStream) yield delta
  if (failure !== undefined) throw new Error(describe(failure))
}

/**
 * Model ids the provider offers, for the settings screen's picker.
 * The AI SDK has no model-listing call, so this one endpoint is spoken directly.
 */
export async function listModels(p: Provider): Promise<string[]> {
  const headers: Record<string, string> =
    p.kind === 'anthropic'
      ? { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', ...browserHeaders }
      : { authorization: `Bearer ${p.apiKey}` }
  const res = await fetch(`${p.baseUrl.replace(/\/$/, '')}/models`, { headers })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  return ((json.data ?? json.models ?? []) as any[]).map((m) => m.id ?? m.name).filter(Boolean).sort()
}

export {
  defaultBaseUrl,
  type Provider,
  type ProviderKind,
  providers,
  useProviders,
  useActiveProvider,
  newProvider,
  saveProvider,
  removeProvider,
  type ProviderConfig,
} from './provider'
