import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { Extension, Tiny } from '@tiny/plugin-host'
import { generateText, tool } from 'ai'
import { useState } from 'react'
import { z } from 'zod'
import css from './styles.css?inline'

/**
 * Everything an extension can add, in one file. Copy it, change the id, and it
 * is yours. Nothing here is special: it is a function of the host that returns
 * a plain object.
 */
export default (tiny: Tiny): Extension => ({
  id: 'starter',
  title: 'Starter',
  css,

  // The model calls these mid-answer. `tool()` is the AI SDK's own, so what you
  // write in `inputSchema` is what `execute` is handed — and what the model sees.
  tools: {
    roll_dice: tool({
      description: 'Roll one or more dice and add them up.',
      inputSchema: z.object({
        sides: z.number().describe('How many sides each die has, e.g. 20'),
        count: z.number().optional().describe('How many to roll. One by default.'),
      }),
      execute: ({ sides, count = 1 }) => {
        const rolls = Array.from(
          { length: count },
          () => 1 + Math.floor(Math.random() * sides),
        )
        return { rolls, total: rolls.reduce((sum, roll) => sum + roll, 0) }
      },
    }),

    // `ask` puts the question in the chat and waits for you to answer it.
    ask_me: tool({
      description: 'Ask the person at the keyboard something only they know.',
      inputSchema: z.object({ question: z.string() }),
      execute: ({ question }) => tiny.ask(question, ['Yes', 'No']),
    }),
  },

  // Offered when a passage of a reply is highlighted, beside the built-in five.
  actions: [{ label: 'Bullets', ask: 'Rewrite this as a short bulleted list' }],

  // Added to the model's system prompt. The Extensions screen shows it in full
  // before anyone turns this on, because nothing else in the app would.
  instructions: 'When a question involves chance, roll for it rather than guessing.',

  // Another model API, offered in Settings beside Anthropic and OpenAI. The
  // provider package is bundled into this file; only the model object crosses over.
  providers: {
    gemini: {
      label: 'Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: ({ baseUrl, apiKey, model }) =>
        createGoogleGenerativeAI({ baseURL: baseUrl, apiKey })(model),
      // No list endpoint worth calling from a browser, so these are the names.
      models: () =>
        Promise.resolve(['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']),
    },
  },

  // A screen of its own, at /#/starter, in the app's own look.
  Screen: () => <Recap tiny={tiny} />,
})

/**
 * Reads your past conversations and asks the model what you have been up to.
 *
 * `tiny` is built once, at the app's module scope, so its hooks are as fixed as
 * an import would be — which is what the rule wants and can't see from here.
 */
function Recap({ tiny }: { tiny: Tiny }) {
  // oxlint-disable-next-line react/rules-of-hooks -- bound once, in the app
  const chats = tiny.useChats()
  // oxlint-disable-next-line react/rules-of-hooks -- bound once, in the app
  const model = tiny.useModel()
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)

  const recap = async () => {
    if (!model) return
    setBusy(true)
    const { text } = await generateText({
      model,
      prompt: `Sum up what this person has been asking about, in three lines.\n\n${chats
        .slice(0, 20)
        .map(({ title }) => `- ${title}`)
        .join('\n')}`,
    })
    setAnswer(text)
    setBusy(false)
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <p className="text-ink-2 text-sm">
        {chats.length} conversation{chats.length === 1 ? '' : 's'} so far.
      </p>
      <button
        type="button"
        data-testid="starter-recap"
        disabled={busy || !model || chats.length === 0}
        onClick={() => void recap()}
        className="bg-brand rounded-control h-control px-4 text-white disabled:opacity-50"
      >
        {busy ? 'Reading…' : 'Recap them'}
      </button>
      {answer && (
        <p className="bg-surface rounded-card shadow-card p-4 text-sm whitespace-pre-wrap">
          {answer}
        </p>
      )}
      {!model && (
        <p className="text-ink-3 text-sm">Set an endpoint, key and model in Settings.</p>
      )}
    </div>
  )
}
