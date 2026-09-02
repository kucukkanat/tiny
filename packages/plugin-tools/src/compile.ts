import {
  asSchema,
  dynamicTool,
  jsonSchema,
  tool,
  type FlexibleSchema,
  type Tool,
} from 'ai'
import { z } from 'zod'
import { askUser } from './ask'

export type Parameter = { readonly name: string; readonly required: boolean }

export type Compiled =
  | {
      readonly ok: true
      readonly tool: Tool
      readonly description: string
      readonly parameters: readonly Parameter[]
    }
  | { readonly ok: false; readonly error: string }

/** What a `tool({ ... })` expression evaluates to, once we've checked it did. */
type Definition = {
  readonly description?: string
  readonly inputSchema?: FlexibleSchema<unknown>
  readonly execute: (input: unknown, options: unknown) => unknown
}

const isDefinition = (value: unknown): value is Definition =>
  typeof value === 'object' &&
  value !== null &&
  'execute' in value &&
  typeof value.execute === 'function' &&
  (!('description' in value) || typeof value.description === 'string')

const parametersOf = (schema: {
  properties?: Record<string, unknown>
  required?: readonly string[]
}): readonly Parameter[] => {
  const required = new Set(schema.required ?? [])
  return Object.keys(schema.properties ?? {}).map((name) => ({
    name,
    required: required.has(name),
  }))
}

/**
 * Your source is a `tool({ ... })` expression, evaluated with `tool`, `z`,
 * `jsonSchema` and `ask` in scope. The parameters the model sees are the ones
 * you wrote in `inputSchema`, so there is no second copy to keep in step.
 *
 * It runs on this thread, which means a tool can reach anything the page can —
 * the API key included — and a loop that never ends freezes the tab. Same deal
 * as the devtools console, and it is your own code either way.
 *
 * Broken source is a value, not a throw: one bad tool shouldn't cost you the
 * screen you'd fix it on.
 */
export const compile = (source: string): Compiled => {
  try {
    const definition: unknown = new Function(
      'tool',
      'z',
      'jsonSchema',
      'ask',
      `return (${source})`,
    )(tool, z, jsonSchema, askUser)

    if (!isDefinition(definition))
      return { ok: false, error: 'Not a tool({ ... }) with an execute function.' }

    const schema = asSchema(definition.inputSchema)
    return {
      ok: true,
      description: definition.description ?? '',
      parameters: parametersOf(schema.jsonSchema),
      // Written after the build, so the SDK can't know the shape: that is what
      // `dynamicTool` is for, and it renders as one part with the name on it.
      tool: dynamicTool({
        description: definition.description,
        inputSchema: schema,
        execute: async (input, options) => await definition.execute(input, options),
      }),
    }
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }
  }
}
