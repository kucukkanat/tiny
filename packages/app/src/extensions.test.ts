import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { SHARED } from './sdk/shared'

const PACKAGES = new URL('../../', import.meta.url).pathname

const manifest = (name: string): { dependencies?: Record<string, string> } =>
  JSON.parse(readFileSync(`${PACKAGES}${name}/package.json`, 'utf8'))

// The rule the app exists to hold: a feature that needs another feature is
// composed here, not imported over there. The host is not a feature, so it is
// not in the namespace and the rule is one predicate.
test('no extension depends on another extension', () => {
  const packages = readdirSync(PACKAGES).filter((name) => name.startsWith('extension-'))

  for (const name of packages) {
    const siblings = Object.keys(manifest(name).dependencies ?? {}).filter((dep) =>
      dep.startsWith('@tiny/extension-'),
    )
    expect([name, siblings]).toEqual([name, []])
  }
})

// An extension is written against these names and nothing else, so adding one
// is a promise and removing one breaks every extension that used it.
test('the shared libraries an extension may import are the ones we said', () => {
  expect(Object.keys(SHARED)).toEqual([
    'react',
    'react/jsx-runtime',
    'react-router',
    'zod',
    'ai',
  ])
})

// If the starter bundled its own React the hooks in its screen would throw, and
// the failure would name neither the starter nor this list.
test('the example extension leaves every shared library to the app', () => {
  const config = readFileSync(`${PACKAGES}extension-starter/vite.config.ts`, 'utf8')
  const external = /external:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? ''

  for (const specifier of Object.keys(SHARED))
    expect([specifier, external.includes(specifier.split('/')[0] ?? '')]).toEqual([
      specifier,
      true,
    ])
})

test('nothing an extension is handed comes from a feature it cannot see', () => {
  const contract = manifest('host').dependencies ?? {}

  // The host is where the contract lives, so it must stay the one package with
  // no feature behind it.
  expect(Object.keys(contract)).toEqual(['ai'])
})
