import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultBaseUrl, listModels } from './index'

const respond = (body: unknown, ok = true) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      status: ok ? 200 : 401,
      statusText: ok ? 'OK' : 'Unauthorized',
      json: async () => body,
      text: async () => JSON.stringify(body),
    })),
  )

afterEach(() => vi.unstubAllGlobals())

describe('listModels', () => {
  it('sorts the ids out of an OpenAI-shaped response', async () => {
    respond({ data: [{ id: 'gpt-5' }, { id: 'gpt-4o' }] })
    const models = await listModels({ kind: 'openai', baseUrl: defaultBaseUrl('openai'), apiKey: 'k' })
    expect(models).toEqual(['gpt-4o', 'gpt-5'])
  })

  it('sends the key the way each provider expects it', async () => {
    respond({ data: [] })
    await listModels({ kind: 'openai', baseUrl: 'https://x/v1', apiKey: 'k' })
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ headers: { authorization: 'Bearer k' } })

    respond({ data: [] })
    await listModels({ kind: 'anthropic', baseUrl: 'https://y/v1', apiKey: 'k' })
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ headers: { 'x-api-key': 'k' } })
  })

  it('trims a trailing slash off the base URL', async () => {
    respond({ data: [] })
    await listModels({ kind: 'openai', baseUrl: 'https://x/v1/', apiKey: 'k' })
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://x/v1/models')
  })

  it('surfaces the provider’s own error text', async () => {
    respond({ error: 'bad key' }, false)
    await expect(listModels({ kind: 'openai', baseUrl: 'https://x/v1', apiKey: '' })).rejects.toThrow(/401.*bad key/)
  })
})
