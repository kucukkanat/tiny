import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import * as z from 'zod'
import type { Provider } from './provider'

// Both dialects answer GET /models with { data: [{ id }] }.
const ModelList = z.object({ data: z.array(z.object({ id: z.string() })) })

type ModelsResult =
  | { readonly ok: true; readonly models: readonly string[] }
  | { readonly ok: false; readonly error: string }

// `api.anthropic.com` refuses a browser outright without this one.
const BROWSER_ACCESS = { 'anthropic-dangerous-direct-browser-access': 'true' }

const authHeaders = (provider: Provider): HeadersInit =>
  provider.kind === 'anthropic'
    ? {
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        ...BROWSER_ACCESS,
      }
    : { Authorization: `Bearer ${provider.apiKey}` }

/** The configured endpoint as a model the SDK can call, straight from the tab. */
export const languageModel = (provider: Provider): LanguageModel =>
  provider.kind === 'anthropic'
    ? createAnthropic({
        baseURL: provider.baseUrl,
        apiKey: provider.apiKey,
        headers: BROWSER_ACCESS,
      })(provider.model)
    : createOpenAICompatible({
        name: 'openai',
        baseURL: provider.baseUrl,
        apiKey: provider.apiKey,
      })(provider.model)

/** Asks the endpoint what it serves. Failure is a value, not a throw — the UI shows it. */
export async function fetchModels(provider: Provider): Promise<ModelsResult> {
  const url = `${provider.baseUrl.replace(/\/$/, '')}/models`

  // The browser hides why a cross-origin request failed, so neither can we.
  const response = await fetch(url, { headers: authHeaders(provider) }).catch(() => null)
  if (!response)
    return { ok: false, error: `Could not reach ${url}. Wrong address, or CORS.` }
  if (!response.ok) {
    return {
      ok: false,
      error: `${url} answered ${response.status} ${response.statusText}`,
    }
  }

  const body = ModelList.safeParse(await response.json().catch(() => null))
  return body.success
    ? { ok: true, models: body.data.data.map(({ id }) => id) }
    : { ok: false, error: `${url} did not answer with a model list` }
}
