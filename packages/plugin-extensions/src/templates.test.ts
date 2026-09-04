import { expect, test } from 'bun:test'
import { SHARED } from '../../app/src/sdk/shared'
import { transformJsx } from './jsx'
import { TEMPLATES } from './templates'

// A template can't be checked by importing it: bare specifiers resolve through
// the page's import map, which doesn't exist under Bun. The transpiler reads
// what the browser will actually be handed — the compiled output — without
// running any of it.
const scan = (source: string) =>
  new Bun.Transpiler({ loader: 'js' }).scan(transformJsx(source))

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

test('a template may use JSX, because it is compiled on the way to the blob', () => {
  expect(scan('export default () => <p>yes</p>').imports.map(({ path }) => path)).toEqual(
    ['react/jsx-runtime'],
  )
})

test('a tag left open is caught here rather than in the browser', () => {
  expect(() => scan('export default () => <p>no')).toThrow()
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
