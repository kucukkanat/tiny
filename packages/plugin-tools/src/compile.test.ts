import { expect, test } from 'bun:test'
import { compile } from './compile'
import { TEMPLATES } from './templates'

/** Compiled, or the reason it wasn't — a test shouldn't have to narrow. */
const built = (source: string) => {
  const result = compile(source)
  if (!result.ok) throw new Error(result.error)
  return result
}

const ADD = `tool({
  description: 'Adds two numbers.',
  inputSchema: z.object({ a: z.number(), b: z.number().optional() }),
  execute: ({ a, b }) => a + (b ?? 0),
})`

test('what the model sees comes out of the source, not a second field', () => {
  const tool = built(ADD)

  expect(tool.description).toBe('Adds two numbers.')
  expect(tool.parameters).toEqual([
    { name: 'a', required: true },
    { name: 'b', required: false },
  ])
})

test('a compiled tool actually runs', async () => {
  const execute = built(ADD).tool.execute
  expect(
    await execute?.({ a: 2, b: 3 }, { toolCallId: 'call-1', messages: [], context: {} }),
  ).toBe(5)
})

test('a tool that takes nothing says so rather than guessing', () => {
  expect(built(`tool({ execute: () => 'now' })`).parameters).toEqual([])
})

test('source that will not parse is an error you can read, not a crash', () => {
  const result = compile('tool({')

  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
})

test('something that is not a tool is turned down', () => {
  expect(compile(`{ description: 'no execute here' }`).ok).toBe(false)
  expect(compile('42').ok).toBe(false)
})

test('every template compiles — a broken example is worse than none', () => {
  for (const { label, source } of TEMPLATES) {
    const result = compile(source)
    expect(result.ok ? '' : `${label}: ${result.error}`).toBe('')
  }
})
