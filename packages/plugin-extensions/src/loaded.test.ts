import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { saveInstalled } from './installed'
import { attach, useExtensions } from './loaded'

/**
 * Fixtures are blob: URL modules with no bare imports. No bare imports because
 * Bun resolves those against the working directory rather than the app's import
 * map, so one would pass here and fail in a browser. Blob rather than data,
 * because Bun's test transpiler resolves a literal data: URL as an asset and
 * hands back the URL instead of the module.
 */
const module = (body: string) =>
  URL.createObjectURL(new Blob([body], { type: 'text/javascript' }))

const install = (id: string, url: string, enabled = true) =>
  localStorage.setItem(
    `tiny.extension.${id}`,
    JSON.stringify({ id, url, title: id, version: 1, enabled }),
  )

const host = {
  useChats: () => [],
  useModel: () => undefined,
  ask: () => Promise.resolve(''),
}

const watch = () => {
  attach(host, ['chat', 'tools', 'settings', 'extensions'])
  return renderHook(useExtensions)
}

const DICE = module(`export default () => ({
  id: 'dice',
  title: 'Dice',
  tools: { roll: { description: 'Roll.', execute: () => 4 } },
})`)

test('nothing installed is ready straight away, with nothing in it', () => {
  const { result } = watch()

  expect(result.current.ready).toBe(true)
  expect(Object.keys(result.current.tools)).toEqual([])
})

test('an extension that is on hands over what it registers', async () => {
  install('1', DICE)
  const { result } = watch()

  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(Object.keys(result.current.tools)).toEqual(['roll'])
  expect(result.current.entries[0]?.status).toBe('ready')
})

test('a tool it registers is the shape chat already renders', async () => {
  install('1', DICE)
  const { result } = watch()
  await waitFor(() => expect(result.current.ready).toBe(true))

  // Wrapped as a dynamic tool, so it takes the same path as one you wrote.
  const roll = result.current.tools.roll
  expect(roll?.type).toBe('dynamic')
  expect(await roll?.execute?.({}, { toolCallId: 'c1', messages: [], context: {} })).toBe(
    4,
  )
})

test('one that is off is not loaded at all', async () => {
  install('1', DICE, false)
  const { result } = watch()

  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.entries).toEqual([])
  expect(Object.keys(result.current.tools)).toEqual([])
})

test('nothing is ready until what is on has answered', () => {
  install('1', DICE)
  const { result } = watch()

  // The route it adds does not exist yet, so the shell must not send you home.
  expect(result.current.ready).toBe(false)
})

test.each([
  ['export const nope = 1', 'default export'],
  ['export default 42', 'default export'],
  ['export default () => ({ title: "No id" })', 'no id and title'],
  ['export default () => ({ id: "Dice!", title: "Bad id" })', 'not a usable id'],
  ['export default () => ({ id: "chat", title: "Thief" })', 'already answers to'],
  ['export default () => { throw new Error("boom at eval") }', 'boom at eval'],
  [
    'export default () => ({ id: "d", title: "D", tools: { "no good": { execute: () => 1 } } })',
    'allowed to call',
  ],
])('%s is turned down with a reason', async (body, said) => {
  install('1', module(body))
  const { result } = watch()

  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.entries[0]?.status).toBe('error')
  expect(result.current.entries[0]?.error).toContain(said)
})

test('one broken extension does not take the working ones with it', async () => {
  install('1', module('export default 42'))
  install('2', DICE)
  const { result } = watch()

  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(Object.keys(result.current.tools)).toEqual(['roll'])
  expect(result.current.entries.map(({ status }) => status).sort()).toEqual([
    'error',
    'ready',
  ])
})

test('a screen, a provider and an action all arrive', async () => {
  install(
    '1',
    module(`export default () => ({
      id: 'kit', title: 'Kit',
      Screen: () => null,
      providers: { gemini: { label: 'Gemini', baseUrl: 'https://g.dev', model: () => 'm', models: () => Promise.resolve([]) } },
      actions: [{ label: 'Translate', ask: 'Translate this' }],
      instructions: 'Prefer metric units.',
    })`),
  )
  const { result } = watch()
  await waitFor(() => expect(result.current.ready).toBe(true))

  expect(result.current.screens.map(({ id }) => id)).toEqual(['kit'])
  expect(Object.keys(result.current.providers)).toEqual(['gemini'])
  expect(result.current.actions.map(({ label }) => label)).toEqual(['Translate'])
  expect(result.current.instructions).toBe('Prefer metric units.')
})

test('its styles go on while it is on, and come off when it is not', async () => {
  const css = module(
    `export default () => ({ id: 'c', title: 'C', css: '.x{color:red}' })`,
  )
  install('1', css)
  const { result } = watch()
  await waitFor(() => expect(document.adoptedStyleSheets.length).toBe(1))
  expect(result.current.ready).toBe(true)

  act(() => saveInstalled({ id: '1', url: css, title: 'C', version: 1, enabled: false }))
  await waitFor(() => expect(document.adoptedStyleSheets.length).toBe(0))
})

test('the same registry comes back the same object, so chat keeps its agent', async () => {
  install('1', DICE)
  const view = watch()
  await waitFor(() => expect(view.result.current.ready).toBe(true))

  const first = view.result.current
  view.rerender()
  expect(view.result.current).toBe(first)
})

test('a reload is not ready until the new one has answered', async () => {
  const url = 'https://x.dev/never-answers.js'
  install('1', url)
  const { result } = watch()
  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.entries[0]?.status).toBe('error')

  // Bumping the version is a different module. An answer about the old one
  // would tell the shell a route exists before it does.
  act(() => saveInstalled({ id: '1', url, title: 'x', version: 2, enabled: true }))
  expect(result.current.ready).toBe(false)
})

test('an address next to the app is one next to the app, not next to a chunk', async () => {
  // The module doing the importing lives under /assets/, so a relative address
  // has to be resolved against the page or it lands somewhere else entirely.
  install('1', './extensions/starter.js')
  const { result } = watch()

  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.entries[0]?.error).toContain('/extensions/starter.js')
  expect(result.current.entries[0]?.error).not.toContain('/assets/')
})
