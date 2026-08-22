# @tiny/plugin-settings

The provider settings screen: add an OpenAI- or Anthropic-compatible endpoint,
paste a key, load the model list, pick one, choose which provider is active.

```ts
import { settingsPlugin } from '@tiny/plugin-settings'
// route: '/settings'; sidebar: a Settings row
```

Edits save as you type — there is no save button and nothing to lose on reload.
The providers themselves live in [`@tiny/llm`](../llm), which is also what the
chat reads, so neither plugin knows the other exists.
