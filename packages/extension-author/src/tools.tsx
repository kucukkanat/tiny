import {
  newSource,
  readInstalled,
  removeInstalled,
  saveInstalled,
  titleIn,
  transformJsx,
  type Installed,
  type Viewed,
} from '@tiny/host'
import { tool } from 'ai'
import { z } from 'zod'
import { Written, Wrote } from './view'

/**
 * The row, or a reason there isn't one. Every `execute` that can refuse is async,
 * so a refusal reaches the SDK as a rejected promise rather than a throw out of
 * its call site: chat shows the first under the chip, and only the SDK knows
 * what it does with the second.
 */
const find = (id: string): Installed => {
  const one = readInstalled().find((row) => row.id === id)
  if (!one) throw new Error(`There is no extension with the id "${id}".`)
  return one
}

/**
 * Stored, then named back. Four fields and not the row: spreading it would hand
 * the model the source it just sent, again, and again on every turn after that.
 */
const wrote = (one: Installed, created: boolean): z.infer<typeof Written> => {
  if (!saveInstalled(one)) throw new Error('There is no room left in storage for this.')
  return { id: one.id, title: one.title, enabled: one.enabled, created }
}

const Id = z.object({ id: z.string().describe('From `extensions`') })

export const tools: Readonly<Record<string, Viewed>> = {
  extensions: tool({
    description: 'List every extension installed here, whether on or off.',
    inputSchema: z.object({}),
    execute: () =>
      readInstalled().map(({ id, title, enabled, url, source }) => ({
        id,
        title,
        enabled,
        // A row is one or the other, so which it is says whether you can edit it.
        ...(url === undefined ? { bytes: source?.length ?? 0 } : { url }),
      })),
  }),

  read_extension: tool({
    description: 'Read the source of one installed extension.',
    inputSchema: Id,
    execute: async ({ id }) => {
      const { title, source, url } = find(id)
      return source === undefined ? { title, url } : { title, source }
    },
  }),

  write_extension: {
    ...tool({
      description:
        'Save an extension. It lands switched off; only the person at the keyboard can turn it on. Pass an id to replace one you already wrote.',
      inputSchema: z.object({
        source: z
          .string()
          .describe(
            'The whole module. Plain JavaScript with JSX; no TypeScript. Call `extension_docs` first.',
          ),
        title: z
          .string()
          .optional()
          .describe('What to call the row. Read out of the source when left off.'),
        id: z
          .string()
          .optional()
          .describe('An existing id, to replace it. A new extension when left off.'),
      }),
      execute: async ({ source, title, id }) => {
        // Compiled here rather than left to fail on Run: the error already names
        // the problem and the position, and that is what makes this a loop you
        // can finish in one turn instead of a broken row nobody noticed.
        transformJsx(source)

        if (id === undefined)
          return wrote(newSource(source, title ?? titleIn(source) ?? 'Pasted'), true)

        const one = find(id)
        // Writing source onto a fetched row would leave it carrying both an
        // address and a body, which is a shape the store drops on the next read.
        if (one.source === undefined)
          throw new Error(
            `"${one.title}" was installed from a URL. Delete it first if you mean to replace it with source.`,
          )

        return wrote(
          {
            ...one,
            source,
            // The same two writers the editor has: while it is off the text names
            // the row, and once it is on the module is what the name comes from.
            title: title ?? (one.enabled ? undefined : titleIn(source)) ?? one.title,
            // What mints a fresh module out of text the browser has seen before.
            version: one.version + 1,
          },
          false,
        )
      },
    }),
    View: Wrote,
  },

  delete_extension: tool({
    description: 'Remove an installed extension for good.',
    inputSchema: Id,
    execute: async ({ id }) => {
      const { title } = find(id)
      removeInstalled(id)
      return { deleted: title }
    },
  }),

  extension_docs: tool({
    description:
      'How to write an extension here: the slots, what `tiny` gives you, and what may be imported. Read this before writing one.',
    inputSchema: z.object({}),
    // Fetched on the first ask rather than shipped: four kilobytes of prose that
    // most visits never read has no business on the first paint of any of them.
    execute: async () => (await import('./docs')).DOCS,
  }),
}
