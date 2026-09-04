import { expect, test } from 'bun:test'
import { completionsFor, SPECIFIERS } from './complete'
import { SHARED } from '../../app/src/sdk/shared'

const labels = (path: string[] | null, line = '') =>
  completionsFor(path, line)?.options.map(({ label }) => label) ?? null

test('tiny. answers with everything the host hands over, and nothing else', () => {
  expect(labels(['tiny', ''])).toEqual(['useChats', 'useModel', 'ask'])
})

test('a half-typed member still answers, so the list can filter', () => {
  expect(labels(['tiny', 'use'])).toEqual(['useChats', 'useModel', 'ask'])
})

test('z. answers with the builders a schema is made of', () => {
  expect(labels(['z', ''])).toContain('object')
  expect(labels(['z', ''])).toContain('string')
})

test('a path we know nothing about says nothing rather than guessing', () => {
  // `response.` could be anything. Offering the document's other words here is
  // how editors suggest code that does not exist.
  expect(labels(['response', ''])).toBeNull()
  expect(labels(['a', 'b', ''])).toBeNull()
})

test('the top level offers the shapes worth having whole', () => {
  const top = labels(['']) ?? []
  expect(top).toContain('extension')
  expect(top).toContain('tool')
  expect(top).toContain('id')
  expect(top).toContain('instructions')
})

test.each([
  "import { tool } from '",
  'import { z } from "',
  "} from '",
  "await import('",
])('%s offers only what the page can resolve', (line) => {
  expect(labels([''], line)).toEqual(SPECIFIERS)
})

test('what it offers to import is what the import map actually carries', () => {
  // Two lists in two packages; this is what stops them drifting apart.
  expect([...SPECIFIERS].sort()).toEqual(Object.keys(SHARED).sort())
})

test('a partly typed specifier keeps its place, so the list can filter', () => {
  const found = completionsFor([''], "import { z } from 'zo")
  expect(found?.word).toBe('zo')
  expect(found?.options.map(({ label }) => label)).toEqual(SPECIFIERS)
})

test('every snippet stops somewhere you have to type', () => {
  const snippets = (completionsFor([''], '')?.options ?? []).filter(
    ({ icon }) => icon === 'snippet',
  )

  expect(snippets.length).toBeGreaterThan(0)
  for (const { label, insert, tabStops } of snippets)
    expect([label, (insert?.length ?? 0) > 0, (tabStops?.length ?? 0) > 0]).toEqual([
      label,
      true,
      true,
    ])
})
