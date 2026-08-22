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

/** Streams the assistant reply as text deltas. */
export const streamChat = (
  p: Provider,
  req: { model: string; messages: ChatMessage[]; signal?: AbortSignal },
): AsyncIterable<string> =>
  streamText({ model: modelFor(p, req.model), messages: req.messages, abortSignal: req.signal }).textStream

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
