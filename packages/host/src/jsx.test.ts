import { expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { transformJsx } from './jsx'

/**
 * Run the output. The import is replaced by parameters so the module body can
 * be evaluated here, where a bare specifier has no import map to resolve it.
 */
const render = (source: string): unknown => {
  const body = transformJsx(source).replace(/^import [^\n]*\n/, '')
  // The emitted code calls the runtime under its import aliases.
  const made = new Function('_jsx', '_jsxs', '_Fragment', `${body}\nreturn __out`) as (
    jsx: unknown,
    jsxs: unknown,
    Fragment: unknown,
  ) => unknown

  // Stand-ins for the runtime, so what comes back is a plain tree to compare.
  const node = (type: unknown, props: Record<string, unknown>, key?: unknown) => ({
    type,
    key: key ?? null,
    props,
  })
  return made(node, node, 'Fragment')
}

const tree = (expression: string) => render(`const __out = ${expression}`)

test('an element becomes a call, with its attributes as props', () => {
  expect(tree('<p className="a">hi</p>')).toEqual({
    type: 'p',
    key: null,
    props: { className: 'a', children: 'hi' },
  })
})

test('a lowercase tag is a string, a capitalised one is the value in scope', () => {
  expect(tree('<div />')).toMatchObject({ type: 'div' })

  const made = render('const Thing = () => null\nconst __out = <Thing x={1} />')
  expect(typeof (made as { type: unknown }).type).toBe('function')
})

test('key is lifted out of props, where React wants it', () => {
  expect(tree('<li key="a" x={1} />')).toEqual({
    type: 'li',
    key: 'a',
    props: { x: 1 },
  })
})

test('a fragment is the runtime one', () => {
  expect(tree('<><a />{2}</>')).toMatchObject({ type: 'Fragment' })
})

test('a spread lands in props, and a later attribute still wins', () => {
  const made = tree('<b {...{ a: 1, c: 3 }} c={9} />') as {
    props: Record<string, number>
  }

  expect(made.props.a).toBe(1)
  expect(made.props.c).toBe(9)
})

test('text collapses the way JSX says it does', () => {
  // Each line trimmed, blank ones dropped, the rest joined with one space.
  expect(tree('<p>\n  one\n  two\n</p>')).toMatchObject({
    props: { children: 'one two' },
  })
})

test('entities are decoded, and the spaces around them survive', () => {
  expect(tree('<p> a &amp; b </p>')).toMatchObject({ props: { children: ' a & b ' } })
})

test('an attribute with no value is true', () => {
  expect(tree('<input disabled />')).toMatchObject({ props: { disabled: true } })
})

/**
 * The frightening half. A scanner that mangles ordinary JavaScript would be far
 * worse than one that cannot do JSX, so this is the corpus: every source file
 * in the repo that has no JSX in it must come out exactly as it went in.
 */
const plainSources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory())
      return entry.name === 'node_modules' ? [] : plainSources(path)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [path] : []
  })

const PACKAGES = new URL('../../', import.meta.url).pathname

test('every plain .ts file in the repo passes through untouched', () => {
  const files = plainSources(PACKAGES).filter((path) => !path.endsWith('jsx.test.ts'))
  expect(files.length).toBeGreaterThan(20)

  const changed = files.filter((path) => {
    const source = readFileSync(path, 'utf8')
    return transformJsx(source) !== source
  })

  expect(changed).toEqual([])
})

test.each([
  ['a string holding a tag', `const a = '</div>'`],
  ['a regex holding a tag', `const r = /<div>/g`],
  ['a comment holding a tag', `// <div>\nconst a = 1`],
  ['a block comment', `/* <b>x</b> */ const a = 1`],
  ['a shift, not a tag', `const a = 1 << 2 >> 1`],
  ['division after a block', `if (a) { } const r = b / c / d`],
  ['a template with a substitution', 'const t = `a ${b < c} d`'],
  ['less-than that is a comparison', `const ok = a < b && c > d`],
])('%s is left exactly as written', (_name, source) => {
  expect(transformJsx(source)).toBe(source)
})

test('an error says what is wrong and where, in the source you wrote', () => {
  expect(() => transformJsx('const a = 1\nconst b = 2\nconst c = <div>\n')).toThrow(
    /unclosed <div> \(\d+:\d+\)/,
  )
})

test('what it emits lines up with what you wrote, so stacks make sense', () => {
  const source = `const a = 1\nconst el = (\n  <p>\n    hi\n  </p>\n)\n`
  // One line more: the import it prepends.
  expect(transformJsx(source).split('\n').length).toBe(source.split('\n').length + 1)
})

test('a file with no JSX gets no import it does not need', () => {
  expect(transformJsx('export default () => ({ id: "a" })')).not.toContain('jsx-runtime')
})
