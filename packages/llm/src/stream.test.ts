import { describe, expect, it, vi } from 'vitest'
import { streamText } from 'ai'
import { streamChat } from './index'

vi.mock('ai', () => ({ streamText: vi.fn() }))

const provider = { kind: 'openai' as const, baseUrl: 'https://x/v1', apiKey: 'k' }

/** Stands in for streamText: yields `deltas`, then reports `error` the way the SDK does. */
const sdkReturns = (deltas: string[], error?: unknown) =>
  vi.mocked(streamText).mockImplementation(((opts: any) => {
    if (error !== undefined) queueMicrotask(() => opts.onError({ error }))
    return {
      textStream: (async function* () {
        for (const d of deltas) yield d
      })(),
    }
  }) as never)

const collect = async () => {
  const out: string[] = []
  for await (const d of streamChat(provider, { model: 'm', messages: [{ role: 'user', content: 'hi' }] })) out.push(d)
  return out.join('')
}

describe('streamChat', () => {
  it('yields the text deltas', async () => {
    sdkReturns(['Hello ', 'there'])
    expect(await collect()).toBe('Hello there')
  })

  it('raises a failure the SDK only reported through onError', async () => {
    sdkReturns([], { statusCode: 401, responseBody: 'Incorrect API key provided' })
    await expect(collect()).rejects.toThrow('401 — Incorrect API key provided')
  })

  it('prefers the provider’s response body over the SDK’s generic message', async () => {
    sdkReturns([], { message: 'No output generated.', statusCode: 429, responseBody: 'Rate limit reached' })
    await expect(collect()).rejects.toThrow('429 — Rate limit reached')
  })

  it('falls back to the message when there is no response body', async () => {
    sdkReturns([], new TypeError('Failed to fetch'))
    await expect(collect()).rejects.toThrow('Failed to fetch')
  })
})
