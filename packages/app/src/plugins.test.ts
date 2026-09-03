import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { plugins } from './plugins'

const PACKAGES = new URL('../../', import.meta.url).pathname

const manifest = (name: string): { dependencies?: Record<string, string> } =>
  JSON.parse(readFileSync(`${PACKAGES}${name}/package.json`, 'utf8'))

// The rule the app exists to hold: a feature that needs another feature is
// composed here, not imported over there.
test('no plugin depends on another plugin', () => {
  const packages = readdirSync(PACKAGES).filter((name) => name.startsWith('plugin-'))

  for (const name of packages) {
    const siblings = Object.keys(manifest(name).dependencies ?? {}).filter(
      (dep) => dep.startsWith('@tiny/plugin-') && dep !== '@tiny/plugin-host',
    )
    expect([name, siblings]).toEqual([name, []])
  }
})

test('every plugin has its own route segment', () => {
  const ids = plugins.map(({ id }) => id)

  expect(new Set(ids).size).toBe(ids.length)
})
