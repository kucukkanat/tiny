import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { Provider, ProviderSpec } from '@tiny/plugin-host'
import * as z from 'zod'

// Both dialects answer GET /models with { data: [{ id }] }.
const ModelList = z.object({ data: z.array(z.object({ id: z.string() })) })

// `api.anthropic.com` refuses a browser outright without this one.
const BROWSER_ACCESS = { 'anthropic-dangerous-direct-browser-access': 'true' }

/**
 * Asks the endpoint what it serves. Throws with something worth reading — the
 * screen shows the message, whoever it came from.
 */
const listModels = async (
  provider: Provider,
  headers: HeadersInit,
): Promise<readonly string[]> => {
  const url = `${provider.baseUrl.replace(/\/$/, '')}/models`

  // The browser hides why a cross-origin request failed, so neither can we.
  const response = await fetch(url, { headers }).catch(() => null)
  if (!response) throw new Error(`Could not reach ${url}. Wrong address, or CORS.`)
  if (!response.ok)
    throw new Error(`${url} answered ${response.status} ${response.statusText}`)

  const body = ModelList.safeParse(await response.json().catch(() => null))
  if (!body.success) throw new Error(`${url} did not answer with a model list`)
  return body.data.data.map(({ id }) => id)
}

/** What ships in the build. An extension can add its own beside these. */
export const providers = {
  anthropic: {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: (provider) =>
      createAnthropic({
        baseURL: provider.baseUrl,
        apiKey: provider.apiKey,
        headers: BROWSER_ACCESS,
      })(provider.model),
    models: (provider) =>
      listModels(provider, {
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        ...BROWSER_ACCESS,
      }),
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: (provider) =>
      createOpenAICompatible({
        name: 'openai',
        baseURL: provider.baseUrl,
        apiKey: provider.apiKey,
      })(provider.model),
    models: (provider) =>
      listModels(provider, { Authorization: `Bearer ${provider.apiKey}` }),
  },
} satisfies Record<string, ProviderSpec>
