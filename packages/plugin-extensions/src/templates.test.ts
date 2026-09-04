import { expect, test } from 'bun:test'
import { SHARED } from '../../app/src/sdk/shared'
import { TEMPLATES } from './templates'

// A template can't be checked by importing it: bare specifiers resolve through
// the page's import map, which doesn't exist under Bun. The transpiler reads
// the same source the browser would without running any of it.
const scan = (source: string) => new Bun.Transpiler({ loader: 'js' }).scan(source)

test.each(TEMPLATES.map(({ label, source }) => [label, source] as const))(
  '%s parses, and says how it is used',
  (_label, source) => {
    expect(scan(source).exports).toContain('default')
  },
)

test.each(TEMPLATES.map(({ label, source }) => [label, source] as const))(
  '%s imports only what the page can resolve',
  (_label, source) => {
    const off = scan(source)
      .imports.map(({ path }) => path)
      .filter((path) => !(path in SHARED))

    expect(off).toEqual([])
  },
)

test('a template written with JSX would fail here rather than in the browser', () => {
  // Nothing compiles a template, so JSX in one is a syntax error at import.
  expect(() => scan('export default () => <p>no</p>')).toThrow()
})

test('a template that will not parse is caught', () => {
  expect(() => scan('export default () => { const = 1 }')).toThrow()
})

test('an import the map does not carry is visible before it runs', () => {
  const off = scan("import x from 'lodash-es'\nexport default () => x")
    .imports.map(({ path }) => path)
    .filter((path) => !(path in SHARED))

  expect(off).toEqual(['lodash-es'])
})
