import { expect, test } from 'bun:test'
import { languageModel } from './models'
import type { Provider } from './provider'

const provider = (kind: Provider['kind']): Provider => ({
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
  expect(languageModel(provider(kind))).toMatchObject({
    modelId: 'm-1',
    provider: expected,
  })
})
