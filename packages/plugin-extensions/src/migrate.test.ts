import { renderHook } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { SHARED } from '../../app/src/sdk/shared'
import { useInstalled } from './installed'
import { migrateTools } from './migrate'

// Read through the hook, so the store's cache is dropped between tests the way
// it is whenever the screen unmounts.
const list = () => renderHook(useInstalled).result.current

/** A tool as the screen that no longer exists would have left it. */
const tool = (id: string, name: string, source: string, enabled = true) =>
  localStorage.setItem(`tiny.tool.${id}`, JSON.stringify({ id, name, source, enabled }))

const DICE = `tool({
  description: 'Roll a die.',
  inputSchema: z.object({ sides: z.number() }),
  execute: ({ sides }) => 1 + Math.floor(Math.random() * sides),
})`

test('a tool you wrote comes across, on if it was on', () => {
  tool('abc123', 'dice', DICE)
  migrateTools()

  const [one] = list()
  expect(one?.title).toBe('dice')
  expect(one?.enabled).toBe(true)
  expect(one?.source).toContain(DICE)
  // Nothing is left behind to migrate a second time.
  expect(localStorage.getItem('tiny.tool.abc123')).toBeNull()
})

test('one that was off stays off', () => {
  tool('abc123', 'dice', DICE, false)
  migrateTools()

  expect(list()[0]?.enabled).toBe(false)
})

test('running it again finds nothing to do', () => {
  tool('abc123', 'dice', DICE)
  migrateTools()
  migrateTools()

  expect(list()).toHaveLength(1)
})

test('each tool becomes its own, so a broken one keeps its own company', () => {
  tool('aaa111', 'dice', DICE)
  tool('bbb222', 'broken', 'tool({ oops')
  migrateTools()

  // One each, because a tool that no longer compiles would otherwise take the
  // rest down with it — and the screen is built to show that on one row.
  expect(
    list()
      .map(({ title }) => title)
      .sort(),
  ).toEqual(['broken', 'dice'])
})

// A migrated module can't be imported here — its `zod` and `ai` come from the
// page's import map, which Bun has no equivalent of. The transpiler reads the
// same text the browser would, without running any of it.
const scan = (source: string) => new Bun.Transpiler({ loader: 'js' }).scan(source)

test('what it writes is a module the page can actually load', () => {
  tool('aaa111', 'dice', DICE)
  migrateTools()
  const source = list()[0]?.source ?? ''

  expect(scan(source).exports).toContain('default')
  expect(
    scan(source)
      .imports.map(({ path }) => path)
      .filter((path) => !(path in SHARED)),
  ).toEqual([])
})

test('a tool that asked you something still can', () => {
  tool('ccc333', 'ask_me', `tool({ execute: ({ q }) => ask(q, ['Yes', 'No']) })`)
  migrateTools()
  const source = list()[0]?.source ?? ''

  // `ask` used to be in scope on its own. Now it comes from the host.
  expect(source).toContain('const ask = tiny.ask')
  expect(source).toContain("ask(q, ['Yes', 'No'])")
  expect(() => scan(source)).not.toThrow()
})

test('storage from a build older than the tool screen is dropped, not carried', () => {
  localStorage.setItem('tiny.tool.a', 'not json at all')
  localStorage.setItem('tiny.tool.b', JSON.stringify({ id: 'b' }))
  // A name no provider would take had no business being a tool either.
  tool('ccc', 'not a name', DICE)
  migrateTools()

  expect(list()).toEqual([])
  expect(Object.keys(localStorage).filter((key) => key.startsWith('tiny.tool.'))).toEqual(
    [],
  )
})
