import * as z from 'zod'
import type { Provider } from './provider'

// Both dialects answer GET /models with { data: [{ id }] }.
const ModelList = z.object({ data: z.array(z.object({ id: z.string() })) })

type ModelsResult =
  | { readonly ok: true; readonly models: readonly string[] }
  | { readonly ok: false; readonly error: string }

const authHeaders = (provider: Provider): HeadersInit =>
  provider.kind === 'anthropic'
    ? {
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        // without this the browser is refused outright
        'anthropic-dangerous-direct-browser-access': 'true',
      }
    : { Authorization: `Bearer ${provider.apiKey}` }

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
