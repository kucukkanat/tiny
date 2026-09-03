# @tiny/plugin-settings

Which model API to call, where, and with what key. Any Anthropic-compatible or
OpenAI-compatible endpoint — the hosted ones, a proxy, or a local server.

Stored in `localStorage`. The key never goes anywhere but the endpoint you set.

The package exports what the app needs to hand a model to something else:

```tsx
import { isUsable, languageModel, useProvider } from '@tiny/plugin-settings'

const [provider, setProvider] = useProvider()
// { kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: '', model: '' }

if (!isUsable(provider)) return <p>Set an endpoint, key and model in Settings.</p>
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

`languageModel` turns all of that into a model the AI SDK can call:

```tsx
const model = languageModel(provider) // an Anthropic or OpenAI-compatible client
```

Which dialect it builds follows `kind`, same as the auth headers do. Anthropic
refuses a browser outright without
`anthropic-dangerous-direct-browser-access: true`, which this sends. It's named
that for a reason — the key is in the page, readable by anything running there.

## Appearance

The screen also holds the theme switch — dark, light, or follow the device. The
choice and the `.dark` class it drives live in `@tiny/ui/lib/theme`; this plugin
only renders the control.
