import { expect, test } from 'bun:test'
import { DOCS, SPECIFIERS, TINY } from './docs'

// The list is written out here rather than imported from the app, so this is
// what holds it to the one an extension is actually given. Adding a name is a
// promise; removing one breaks every extension that used it.
test('the importable names are the ones the app puts on the map', () => {
  expect(SPECIFIERS).toEqual(['react', 'react/jsx-runtime', 'react-router', 'zod', 'ai'])
})

test.each(Object.keys(TINY))('the guide says what tiny.%s is', (name) => {
  expect(DOCS).toContain(name)
})

// Two mistakes cost a whole turn each, so they are worth a test: a model that
// writes TypeScript, and one that writes a relative import a blob cannot resolve.
test.each(['TypeScript, no', 'relative import'])('the guide rules out %s', (rule) => {
  expect(DOCS).toContain(rule)
})
