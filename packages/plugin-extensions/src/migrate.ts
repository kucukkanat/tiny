import { isExtensionId, isToolName } from '@tiny/plugin-host'
import { z } from 'zod'
import { newSource, saveInstalled, type Installed } from './installed'

// Where tools lived when they were their own feature, before extensions could
// carry them. This whole file exists to empty that drawer, and can go once
// nobody is coming from a build that had one.
const PREFIX = 'tiny.tool.'

const Tool = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  enabled: z.boolean(),
})

/**
 * A tool was an expression with `tool`, `z`, `jsonSchema` and `ask` already in
 * scope. An extension is a module, so the scope has to be written out — three
 * imports and the one thing that isn't an import.
 */
const moduleFor = ({ id, name, source }: z.infer<typeof Tool>) =>
  `import { jsonSchema, tool } from 'ai'
import { z } from 'zod'

export default (tiny) => {
  const ask = tiny.ask
  return {
    id: '${id}',
    title: '${name}',
    tools: {
      ${name}: ${source},
    },
  }
}
`

const parse = (raw: string | null): unknown => {
  try {
    return JSON.parse(raw ?? '')
  } catch {
    return null
  }
}

/**
 * Every tool you wrote becomes an extension of its own — its own, because one
 * that no longer compiles would otherwise take the rest down with it, and this
 * screen is built to show exactly that on one row.
 *
 * It stays on if it was on. The rule that an install never turns itself on is
 * about code arriving from a link; this is code you already wrote and ran.
 */
export const migrateTools = () => {
  for (const key of Object.keys(localStorage).filter((one) => one.startsWith(PREFIX))) {
    const stored = Tool.safeParse(parse(localStorage.getItem(key)))
    // Unreadable, or named something no model would call: there is nothing to
    // carry over, and leaving the key would mean trying again every boot.
    if (stored.success && isToolName(stored.data.name)) {
      const id = stored.data.id
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .slice(0, 32)
      const one: Installed = {
        ...newSource(moduleFor(stored.data), stored.data.name),
        ...(isExtensionId(id) ? { id } : {}),
        enabled: stored.data.enabled,
      }
      // Keep the tool until it is safely somewhere else.
      if (!saveInstalled(one)) continue
    }
    localStorage.removeItem(key)
  }
}
