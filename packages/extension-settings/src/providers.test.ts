import { expect, test } from 'bun:test'
import type { Provider } from '@tiny/host'
import { providers } from './providers'

const provider = (kind: string): Provider => ({
  kind,
  baseUrl: 'http://localhost:1234/v1',
  apiKey: 'sk-test',
  model: 'm-1',
})

// The dialect decides which client answers; the model name is carried either way.
test.each([
  ['anthropic', 'anthropic.messages'],
  ['openai', 'openai.chat'],
] as const)('%s builds a %s model', (kind, expected) => {
  expect(providers[kind].model(provider(kind))).toMatchObject({
    modelId: 'm-1',
    provider: expected,
  })
})

test('every built-in says what it is and where it goes', () => {
  for (const [kind, spec] of Object.entries(providers)) {
    expect([kind, spec.label.length > 0, URL.canParse(spec.baseUrl)]).toEqual([
      kind,
      true,
      true,
    ])
  }
})
