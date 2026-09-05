/**
 * Somewhere to start, and the closest thing to documentation this screen has.
 * Two tools and a screen — a tool that reaches the network, one that asks you,
 * and something with a face on it.
 *
 * They are modules, not files. JSX works — it is compiled on the way to being
 * run — but TypeScript is not, and only `react`, `react/jsx-runtime`,
 * `react-router`, `zod` and `ai` can be imported. Anything else has to come from
 * an extension you build and host yourself.
 */
export const TEMPLATES = [
  {
    label: 'Weather',
    title: 'Weather',
    source: `import { tool } from 'ai'
import { z } from 'zod'

export default () => ({
  id: 'weather',
  title: 'Weather',
  tools: {
    weather: tool({
      description: 'Current weather in a city.',
      inputSchema: z.object({
        city: z.string().describe('City name, e.g. Istanbul'),
      }),
      execute: async ({ city }, { abortSignal }) => {
        const url = 'https://wttr.in/' + encodeURIComponent(city) + '?format=j1'
        const response = await fetch(url, { signal: abortSignal })
        if (!response.ok) throw new Error('wttr.in said ' + response.status)
        const now = (await response.json()).current_condition[0]
        // Hand back what answers the question. The whole payload is 40kB of noise.
        return { celsius: now.temp_C, description: now.weatherDesc[0].value }
      },
    }),
  },
})
`,
  },
  {
    label: 'Ask me',
    title: 'Ask me',
    source: `import { tool } from 'ai'
import { z } from 'zod'

export default (tiny) => ({
  id: 'ask-me',
  title: 'Ask me',
  tools: {
    ask_me: tool({
      description: 'Ask the person at the keyboard something only they know.',
      inputSchema: z.object({
        question: z.string().describe('What to ask, in one sentence'),
      }),
      // The question appears in the chat and this waits for the answer. The
      // second argument offers choices; you can always type something else.
      execute: ({ question }) => tiny.ask(question, ['Yes', 'No']),
    }),
  },
})
`,
  },
  {
    label: 'Recap',
    title: 'Recap',
    source: `import { useState } from 'react'

export default (tiny) => ({
  id: 'recap',
  title: 'Recap',
  Screen: () => {
    const chats = tiny.useChats()
    const [shown, setShown] = useState(5)

    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <p className="text-ink-2 text-sm">{chats.length} conversations so far.</p>
        {chats.slice(0, shown).map((chat) => (
          <p key={chat.id} className="bg-surface rounded-card p-3 text-sm">
            {chat.title}
          </p>
        ))}
        {chats.length > shown && (
          <button
            type="button"
            className="border-line rounded-control h-control border px-4 text-sm"
            onClick={() => setShown(shown + 5)}
          >
            Show more
          </button>
        )}
      </div>
    )
  },
})
`,
  },
] as const
