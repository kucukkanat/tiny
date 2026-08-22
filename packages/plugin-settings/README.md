# @tiny/plugin-settings

Which model API to call, where, and with what key. Any Anthropic-compatible or
OpenAI-compatible endpoint — the hosted ones, a proxy, or a local server.

Stored in `localStorage`. The key never goes anywhere but the endpoint you set.

```ts
import { isUsable, readProvider, useProvider } from '@tiny/plugin-settings'

const provider = readProvider()
// { kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: '' }

if (!isUsable(provider)) throw new Error('Set an endpoint and key in Settings')
```

In a component, `useProvider` gives you the same value plus a patch function:

```tsx
const [provider, setProvider] = useProvider()

setProvider({ apiKey: 'sk-ant-...' })
setProvider({ kind: 'openai' }) // endpoint follows, key stays
setProvider({ kind: 'openai', baseUrl: 'http://localhost:1234/v1' }) // or set both
```

Switching `kind` swaps in that dialect's default endpoint unless you pass one.
`isUsable` is the check to run before a model call — it wants a key and a
parseable URL, and it can't tell you the key is _right_.

## Appearance

The screen also holds the theme switch — dark, light, or follow the device. The
choice and the `.dark` class it drives live in `@tiny/ui/lib/theme`; this plugin
only renders the control.
