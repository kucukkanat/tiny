# @tiny/extension-settings

Which model API to call, where, and with what key. Any Anthropic-compatible or
OpenAI-compatible endpoint — the hosted ones, a proxy, or a local server.

Stored in `localStorage`. The key never goes anywhere but the endpoint you set.

This package is the screen. What it stores lives in `@tiny/host/app`, because
chat reads it too and neither may import the other:

```tsx
import { isUsable, useProvider } from '@tiny/host/app'

const [provider, setProvider] = useProvider(specs)
// { kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: '', model: '' }

if (!isUsable(provider, specs)) return <p>Set an endpoint, key and model.</p>
```

`setProvider` takes a patch, and a patch changes what it names and nothing else:

```tsx
setProvider({ apiKey: 'sk-ant-...' })
setProvider({ kind: 'openai' }) // endpoint, key and model all stay put
setProvider({ baseUrl: '' }) // empty falls back to this dialect's default
```

Switching dialect leaves the endpoint alone — one local server or proxy often
speaks both, and having the address wiped for changing how you talk to it is no
help. To get a dialect's own default back, clear the endpoint field.

`isUsable` is the check to run before a model call — it wants a key and a
parseable URL, and it can't tell you the key is _right_.

A dialect is a `ProviderSpec`, and this package contributes the two that ship
through the same `providers` slot any extension uses — so Settings offers a row
per spec whoever registered it, and `spec.model(provider)` is what turns your
endpoint, key and model name into a client the AI SDK can call:

```tsx
const model = specs[provider.kind]?.model(provider)
```

Anthropic refuses a browser outright without
`anthropic-dangerous-direct-browser-access: true`, which this sends. It's named
that for a reason — the key is in the page, readable by anything running there.

## Appearance

The screen also holds the theme switch — dark, light, or follow the device. The
choice and the `.dark` class it drives live in `@tiny/ui/lib/theme`; this only
renders the control.
