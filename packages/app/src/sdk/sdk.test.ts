import { asSchema } from 'ai'
import { expect, test } from 'bun:test'
import { readFileSync, readlinkSync } from 'node:fs'
import { z } from 'zod'
import { importmap, SHARED } from './shared'

const PACKAGES = new URL('../../../', import.meta.url).pathname

const named = (file: string): string[] => {
  const source = readFileSync(`${PACKAGES}app/src/sdk/${file}.ts`, 'utf8')
  const block = /export\s*\{([^}]*)\}\s*from/g
  return [...source.matchAll(block)]
    .flatMap(([, names]) => (names ?? '').split(','))
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && !name.startsWith('type '))
}

// React is CommonJS, so `export *` gives only `default` — the names have to be
// written out, and the dev server would hide it if one went missing.
test('the react shim re-exports everything react has', async () => {
  const react: Record<string, unknown> = await import('react')
  const missing = Object.keys(react).filter(
    (name) =>
      !name.startsWith('__') &&
      // @types/react does not declare this one, so it cannot be re-exported.
      name !== 'unstable_useCacheRefresh' &&
      !named('react').includes(name),
  )

  expect(missing).toEqual([])
})

test('the jsx shim is the runtime a build actually uses', () => {
  // Not jsx-dev-runtime: a production React exports `jsxDEV` as undefined, so
  // mapping it would swap a clear error for a mystery at first render.
  expect(named('jsx-runtime').sort()).toEqual(['Fragment', 'jsx', 'jsxs'])
})

test('the map names a file for every shared library, and nothing else', () => {
  const map = importmap((entry) => `/${entry}.js`)

  expect(Object.keys(map)).toEqual(['imports'])
  expect(Object.keys(map.imports)).toEqual(Object.keys(SHARED))
})

test('a specifier with a subpath still resolves to its own file', () => {
  // `react/jsx-runtime` is a different module from `react`, and a map does
  // prefix substitution only — it would never append the rest for us.
  const map = importmap((entry) => `/${entry}.js`)

  expect(map.imports['react/jsx-runtime']).toBe('/jsx-runtime.js')
  expect(map.imports.react).toBe('/react.js')
})

/**
 * Two copies of `@ai-sdk/provider-utils` are installed, behind different majors
 * of zod, and schema conversion goes through whichever one is linked. The wrong
 * one drops every description and constraint silently — the model just gets a
 * worse tool. This is the cheapest guard there is, and it covers every tool in
 * the app, not only an extension's.
 */
test('what an author writes about a parameter reaches the model', () => {
  const schema = asSchema(
    z.object({ city: z.string().describe('City name, e.g. Istanbul') }),
  )
  const { properties } = schema.jsonSchema as {
    properties: { city: { description?: string } }
  }

  expect(properties.city.description).toBe('City name, e.g. Istanbul')
})

test('the app resolves the same ai as the features that hand it tools', () => {
  const variant = (pkg: string) =>
    readlinkSync(`${PACKAGES}${pkg}/node_modules/ai`).replace(/^.*\/\.bun\//, '')

  expect(variant('app')).toBe(variant('extension-chat'))
  expect(variant('extension-manager')).toBe(variant('extension-chat'))
})
