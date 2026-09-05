import type { Extension, Tiny } from '@tiny/host'
import type { Completion } from 'prism-code-editor/autocomplete'

/**
 * What an extension can actually reach, written out.
 *
 * A real language service was measured at 1.76 MB gzipped and would still be
 * worse here: five overloads of `tool()` defeat its contextual typing, so it
 * answers `tool({` with a thousand globals. This world is five importable
 * modules and one object shape, which is small enough to know exactly.
 */

/** Keyed on the type, so adding to `Tiny` fails the build until it's listed. */
const TINY: Record<keyof Tiny, Completion> = {
  useChats: {
    label: 'useChats',
    icon: 'method',
    detail: '(): readonly Chat[]',
  },
  useModel: {
    label: 'useModel',
    icon: 'method',
    detail: '(): LanguageModel | undefined',
  },
  ask: {
    label: 'ask',
    icon: 'method',
    detail: '(question, options?): Promise<string>',
  },
  useTools: {
    label: 'useTools',
    icon: 'method',
    detail: "(): ToolSet — every extension's, yours included",
  },
  useInstructions: {
    label: 'useInstructions',
    icon: 'method',
    detail: '(): string | undefined — the whole system prompt',
  },
  useActions: {
    label: 'useActions',
    icon: 'method',
    detail: '(): readonly ChatAction[]',
  },
  useMessageActions: {
    label: 'useMessageActions',
    icon: 'method',
    detail: '(): readonly MessageAction[]',
  },
  useProviders: {
    label: 'useProviders',
    icon: 'method',
    detail: '(): Record<string, ProviderSpec>',
  },
}

/** Same again for what an extension hands back. */
const EXTENSION: Record<keyof Extension, string> = {
  id: 'string — its own route, a-z and dashes',
  title: 'string — what the sidebar calls it',
  Screen: '() => ReactNode — a screen at /#/<id>',
  Sidebar: '() => ReactNode — a section in the sidebar',
  tools: 'Record<string, Tool> — what the model may call',
  providers: 'Record<string, ProviderSpec> — another model API',
  actions: 'ChatAction[] — offered on a highlighted reply',
  messageActions: 'MessageAction[] — offered in a message footer',
  instructions: 'string — added to the system prompt',
  css: 'string — adopted while this is on',
}

const field = (label: string): Completion => ({
  label,
  icon: 'property',
  detail: EXTENSION[label as keyof Extension],
})

/** The five the import map answers to. Anything else fails at import. */
export const SPECIFIERS = ['react', 'react/jsx-runtime', 'react-router', 'zod', 'ai']

// Only the builders you reach for writing an inputSchema. zod is large; this is
// the part of it a tool actually uses.
const ZOD = [
  ['object', '(shape): ZodObject'],
  ['string', '(): ZodString'],
  ['number', '(): ZodNumber'],
  ['boolean', '(): ZodBoolean'],
  ['array', '(item): ZodArray'],
  ['enum', '(values): ZodEnum'],
  ['literal', '(value): ZodLiteral'],
  ['optional', '(inner): ZodOptional'],
  ['union', '(options): ZodUnion'],
  ['record', '(key, value): ZodRecord'],
] as const

/**
 * The shapes worth having whole. A snippet is worth more than a list on a
 * phone: `${...}` marks where the cursor stops, so the whole thing arrives and
 * you tab through the parts you have to fill in.
 */
const SNIPPETS: readonly Completion[] = [
  {
    label: 'extension',
    icon: 'snippet',
    detail: 'the whole module',
    insert: `export default (tiny) => ({
  id: 'my-extension',
  title: 'My extension',
})`,
    tabStops: [22, 35, 47, 60],
  },
  {
    label: 'tool',
    icon: 'snippet',
    detail: 'a tool the model can call',
    insert: `tool({
  description: 'What it does, in one line.',
  inputSchema: z.object({ city: z.string() }),
  execute: ({ city }) => city,
})`,
    tabStops: [23, 49],
  },
  {
    label: 'screen',
    icon: 'snippet',
    detail: 'a screen, without JSX',
    insert: `Screen: () => h('p', { className: 'text-ink text-sm' }, 'Hello')`,
    tabStops: [56, 61],
  },
  {
    label: 'ask',
    icon: 'snippet',
    detail: 'ask the person at the keyboard',
    insert: `tiny.ask('What should I use?', ['This', 'That'])`,
    tabStops: [9, 28],
  },
]

const KEYS = Object.keys(EXTENSION).map(field)

/**
 * What to offer, given the dotted path before the cursor and the line it is on.
 * Kept free of the editor so it can be tested without one.
 */
export const completionsFor = (
  path: readonly string[] | null,
  lineBefore: string,
): { readonly word: string; readonly options: readonly Completion[] } | null => {
  // Inside the quotes of an import. Offering anything else here is offering a
  // module that fails to resolve.
  const importing = /(?:from|import)\s*\(?\s*(['"])([^'"]*)$/.exec(lineBefore)
  if (importing)
    return {
      word: importing[2] ?? '',
      options: SPECIFIERS.map((label) => ({ label, icon: 'namespace' as const })),
    }

  if (!path) return null
  const word = path.at(-1) ?? ''
  const owner = path.length === 2 ? path[0] : undefined

  if (owner === 'tiny') return { word, options: Object.values(TINY) }
  if (owner === 'z')
    return {
      word,
      options: ZOD.map(([label, detail]) => ({ label, icon: 'method' as const, detail })),
    }
  // Deeper than we know anything about: say nothing rather than guess.
  if (path.length > 1) return null

  return { word, options: [...SNIPPETS, ...KEYS] }
}
