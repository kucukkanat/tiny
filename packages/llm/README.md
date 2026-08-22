# @tiny/llm

Talks to OpenAI- and Anthropic-compatible providers, and remembers how they're
configured. Streaming goes through the [Vercel AI SDK](https://ai-sdk.dev); this
package only decides which provider to hand it.

```ts
import { streamChat, listModels } from '@tiny/llm'

const provider = { kind: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-…' }

for await (const delta of streamChat(provider, {
  model: 'gpt-5',
  messages: [{ role: 'user', content: 'Hello' }],
})) {
  process.stdout.write(delta)
}
```

`listModels(provider)` returns the model ids the endpoint offers — the AI SDK has
no model-listing call, so that one request is made directly.

## Configured providers

`providers` is a [`@tiny/store`](../store) value holding the list the user set up
and which one is active.

```tsx
import { newProvider, saveProvider, useActiveProvider } from '@tiny/llm'

saveProvider({ ...newProvider('anthropic'), apiKey: 'sk-ant-…' })

function ModelName() {
  return <span>{useActiveProvider()?.model}</span>
}
```

Anthropic blocks browser calls unless the caller opts in, so requests carry
`anthropic-dangerous-direct-browser-access: true`.
