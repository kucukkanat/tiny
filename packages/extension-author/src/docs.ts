import type { Extension, Tiny } from '@tiny/host'

/**
 * The five names an extension may import. Not read from the app's own list on
 * purpose — that list is app-side, and this one is a promise made to a module
 * already sitting in someone's storage. `docs.test.ts` holds them together.
 */
const SPECIFIERS = ['react', 'react/jsx-runtime', 'react-router', 'zod', 'ai']

/**
 * Typed on `keyof Tiny`, so a ninth member of the contract fails this build
 * until it is documented. That is the same trick the editor's completion table
 * uses, and it is worth having twice: both are promises to a stored module, and
 * one of them going stale is a model writing against a world that moved.
 */
const TINY: Record<keyof Tiny, string> = {
  useChats: '(): readonly Chat[] — every past conversation: id, title, updatedAt, text',
  useModel: '(): LanguageModel | undefined — undefined until Settings has a key',
  ask: '(question: string, options?: readonly string[]): Promise<string> — asks the person, in the chat',
  useTools:
    '(): Record<string, Tool & { View? }> — every tool that is on, yours included',
  useInstructions: '(): string | undefined — every extension’s instructions, joined',
  useActions: '(): readonly ChatAction[] — what is offered on a highlighted passage',
  useMessageActions: '(): readonly MessageAction[] — the buttons under every message',
  useProviders: '(): Registry — every model endpoint on offer, by kind',
}

/** Typed on `keyof Extension` for the same reason. */
const SLOTS: Record<keyof Extension, string> = {
  id: 'required. a-z, 0-9 and dashes. Your screen is at /#/<id>.',
  title: 'required. What it is called in the sidebar and on the Extensions screen.',
  Screen: 'a component, at /#/<id>. Nested routes below it are yours.',
  Sidebar: 'a component, in the sidebar. Without one you get a footer nav link.',
  tools: 'the model calls these mid-answer. `{ ...tool({…}), View }`.',
  providers: 'another model endpoint, offered in Settings.',
  actions: '`{ label, ask }` — offered when a passage of a reply is highlighted.',
  messageActions: '`{ label, icon?, when?, run }` — a button under every message.',
  instructions: 'added to the system prompt, verbatim, on every turn. Keep it short.',
  css: 'a stylesheet string, adopted while you are on and removed when you are off.',
}

const list = (table: Record<string, string>) =>
  Object.entries(table)
    .map(([name, note]) => `- \`${name}\` — ${note}`)
    .join('\n')

/**
 * What the model is told before it writes one. It is a tool rather than
 * `instructions` because it is four kilobytes that matter twice a week, and
 * `instructions` is context on every turn of every conversation.
 */
export const DOCS = `# Writing an extension

A module with a default export that is a function of the host and returns a
plain object. Nothing else.

\`\`\`jsx
import { tool } from 'ai'
import { z } from 'zod'

export default (tiny) => ({
  id: 'dice',
  title: 'Dice',
  tools: {
    roll: tool({
      description: 'Roll a die.',
      inputSchema: z.object({ sides: z.number().describe('How many sides') }),
      execute: ({ sides }) => 1 + Math.floor(Math.random() * sides),
    }),
  },
  instructions: 'When a question turns on chance, roll for it.',
})
\`\`\`

## What it may import

Only these, and only as bare specifiers:

${SPECIFIERS.map((one) => `- \`${one}\``).join('\n')}

A relative import cannot work: the module runs from a \`blob:\` URL, which has no
base to resolve against. Anything else — a charting library, a date library —
you inline, or \`import()\` from a CDN inside the component that needs it, so it
lands on whoever installed this and on nobody else.

## What compiles

JSX, yes. TypeScript, no — \`const n: number = 1\` is a syntax error, and so is
\`<T,>\`. Write plain JavaScript with JSX in it.

## The slots

${list(SLOTS)}

## What \`tiny\` gives you

Every \`use*\` is a React hook and follows the rules of one: call it at the top of
a component, never inside a condition or a callback.

${list(TINY)}

## Tools

\`tool()\` from \`ai\`. What you put in \`inputSchema\` is what the model sees, so
\`.describe()\` every field — that text is the whole of what it has to go on.
\`execute\` may be async and is handed \`(input, { abortSignal })\`.

Two extras ride on a tool:

- \`View\` — a component given \`{ input, output }\`, both \`unknown\`, that draws the
  result in the reply. It is called once the output has arrived and never
  before, so there is no loading state to defend against. Parse what you are
  handed; it came back through \`JSON.stringify\`.
- \`toModelOutput\` — what the model is told, as against what \`View\` is drawn
  from. Without it a payload written to be looked at is also spent in the
  model's context, in full, on every turn after this one.

\`\`\`jsx
tools: {
  chart: {
    ...tool({
      description: 'Draw labelled numbers.',
      inputSchema: Rows,
      execute: (input) => input,
      toModelOutput: () => ({ type: 'text', value: 'Drawn.' }),
    }),
    View: Bars,
  },
}
\`\`\`

## Styling

Tailwind classes on the app's own tokens: \`bg-surface\`, \`border-line\`,
\`text-ink\` / \`text-ink-2\` / \`text-ink-3\`, \`bg-brand\`, \`rounded-card\`,
\`rounded-control\`, \`rounded-chip\`, \`h-control\`, \`bg-hover-2\`. They are already
in the page, so they cost nothing and they follow the theme.

Mobile first. Every interactive element gets a \`data-testid\`.

## Names

Ids and tool names are first-come: the app's own extensions fold first, so a
tool called \`chart\` is already taken. Pick something nobody else would.
`

export { SPECIFIERS, TINY }
