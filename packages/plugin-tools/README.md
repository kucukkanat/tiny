# @tiny/plugin-tools

Tools you write in the app. The model calls them mid-answer.

A tool is a `tool({ ... })` expression — the AI SDK's own shape, nothing wrapped
around it. What the model is told the tool takes comes out of the `inputSchema`
you wrote, so there is no second copy of the parameters to keep in step.

```js
tool({
  description: 'Current weather in a city.',
  inputSchema: z.object({
    city: z.string().describe('City name, e.g. Istanbul'),
  }),
  execute: async ({ city }, { abortSignal }) => {
    const url = 'https://wttr.in/' + encodeURIComponent(city) + '?format=j1'
    const response = await fetch(url, { signal: abortSignal })
    if (!response.ok) throw new Error('wttr.in said ' + response.status)
    const now = (await response.json()).current_condition[0]
    return { celsius: now.temp_C, description: now.weatherDesc[0].value }
  },
})
```

Paste that into a new tool, name it `weather`, and ask the model what to wear in
Istanbul. It runs, the call shows up in the transcript with what went in and what
came back, and the reply carries on.

## What's in scope

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| `tool`       | the SDK's `tool()`. Your source is one call to it                        |
| `z`          | all of zod, for `inputSchema`                                            |
| `jsonSchema` | hand-written JSON Schema, if zod isn't the shape you want                |
| `ask`        | `ask('question')` — puts a question in the chat and waits for the answer |

`fetch` and everything else the page has is there too, because this runs in the page.

`execute` gets the SDK's second argument, so `{ abortSignal }` is how a request
dies when you stop the reply.

### Asking instead of fetching

```js
tool({
  description: 'Ask the person at the keyboard something only they know.',
  inputSchema: z.object({ question: z.string() }),
  execute: ({ question }) => ask(question),
})
```

The agent loop runs in this tab, so the call simply waits. Nothing times out.

## Using them

```tsx
import { ToolQuestions, useToolSet } from '@tiny/plugin-tools'

const tools = useToolSet() // every tool that is on, named, and compiles
const agent = new ToolLoopAgent({ model, tools })
```

`useToolSet` is memoised on the stored list, so an agent built from it is only
rebuilt when a tool actually changes. Render `<ToolQuestions />` somewhere in the
conversation and `ask` works.

Tools run as soon as the model calls them. The switch on each row is the control.

## Two things worth knowing

**Your tool is not sandboxed.** It is compiled with `new Function` and runs on
the page's own thread, so it can read anything the page can — the API key
included — and a loop that never ends freezes the tab. That is the same deal as
the devtools console, and it is your own code either way. A Worker would buy a
real timeout, at the cost of shipping zod into it and marshalling the schema back
out; a tool's `fetch` could still reach anywhere regardless.

**Broken source is a value, not a throw.** A tool that doesn't compile is left
out of the set and shows its error under the box — one bad tool shouldn't cost
you the screen you'd fix it on, or the tools that do work.

## Storage

One `localStorage` key per tool, `tiny.tool.<id>`, holding `{ id, name, source,
enabled }`. Description and parameters aren't stored: they're read back out of
`source`, which is why they can't drift from it. Anything zod won't vouch for on
read is dropped rather than crashing the list.
