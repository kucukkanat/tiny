import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { saveInstalled } from './installed'
import { attach, runningSource, useExtensions } from './loaded'

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

test('two extensions wanting one tool name: one gets it, and both are loaded', async () => {
  const dice = (id: string) =>
    module(`export default () => ({
      id: '${id}', title: '${id}',
      tools: { roll: { description: 'Roll.', execute: () => '${id}' } },
    })`)
  install('1', dice('one'))
  install('2', dice('two'))
  const { result } = watch()

  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.entries.every(({ status }) => status === 'ready')).toBe(true)
  expect(Object.keys(result.current.tools)).toEqual(['roll'])
})

/** One written in the app: the text is what's stored, not an address. */
const write = (id: string, source: string, version = 1, enabled = true) =>
  localStorage.setItem(
    `tiny.extension.${id}`,
    JSON.stringify({ id, source, title: id, version, enabled }),
  )

const DICE_SOURCE = `export default () => ({
  id: 'dice',
  title: 'Dice',
  tools: { roll: { description: 'Roll.', execute: () => 4 } },
})`

test('one written here runs from its text, with no address to fetch', async () => {
  write('1', DICE_SOURCE)
  const { result } = watch()

  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(Object.keys(result.current.tools)).toEqual(['roll'])
})

test('the text is what survives a reload, and a fresh module is made of it', async () => {
  write('1', DICE_SOURCE)
  const first = watch()
  await waitFor(() => expect(first.result.current.ready).toBe(true))
  first.unmount()

  // A blob url dies with the page. Nothing of it is stored, so this is the
  // same path a returning visitor takes.
  const { result } = watch()
  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(Object.keys(result.current.tools)).toEqual(['roll'])
})

test('typing does not run it — importing a module is running it', async () => {
  write('1', DICE_SOURCE)
  const { result } = watch()
  await waitFor(() => expect(result.current.ready).toBe(true))

  // A half-written loop would take the tab with it, so text alone is not a
  // trigger. The version is. If this ever regresses, this test hangs rather
  // than fails, which is rather the point.
  const edited = `${DICE_SOURCE}\nwhile (true) {}`
  act(() =>
    saveInstalled({ id: '1', source: edited, title: '1', version: 1, enabled: true }),
  )

  expect(
    runningSource({ id: '1', source: edited, title: '1', version: 1, enabled: true }),
  ).toBe(DICE_SOURCE)
  expect(result.current.ready).toBe(true)
})

test('Run picks up an edit, and runs again even when nothing changed', async () => {
  write('1', DICE_SOURCE)
  const { result } = watch()
  await waitFor(() => expect(result.current.ready).toBe(true))

  const edited = DICE_SOURCE.replace("'Roll.'", "'Roll two.'").replace('=> 4', '=> 7')
  act(() =>
    saveInstalled({ id: '1', source: edited, title: '1', version: 2, enabled: true }),
  )

  await waitFor(() =>
    expect(result.current.entries[0]?.extension?.tools?.roll?.description).toBe(
      'Roll two.',
    ),
  )
})

test('what is running is what Run last took, not what is on screen', async () => {
  const one = { id: '1', source: DICE_SOURCE, title: '1', version: 1, enabled: true }
  write('1', DICE_SOURCE)
  const { result } = watch()
  await waitFor(() => expect(result.current.ready).toBe(true))

  expect(runningSource(one)).toBe(DICE_SOURCE)
  expect(runningSource({ ...one, source: 'edited' })).toBe(DICE_SOURCE)
  // A version nothing has run yet is running nothing.
  expect(runningSource({ ...one, version: 2 })).toBeUndefined()
})

test('source that will not parse is an error on its own row', async () => {
  write('1', 'export default () => { const = 1 }')
  write('2', DICE_SOURCE)
  const { result } = watch()

  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(Object.keys(result.current.tools)).toEqual(['roll'])
  expect(result.current.entries.map(({ status }) => status).sort()).toEqual([
    'error',
    'ready',
  ])
})

test('a tag left open is an error on the row, not a broken screen', async () => {
  // JSX is compiled on the way to the blob, so a syntax error has to arrive
  // where every other reason an extension didn't start already shows up.
  write('1', `export default () => ({ id: 'a', title: 'A', Screen: () => <div> })`)
  const { result } = watch()

  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.entries[0]?.status).toBe('error')
  expect(result.current.entries[0]?.error).toContain('unclosed <div>')
})

test('a broken tag in one extension leaves the others running', async () => {
  write('1', `export default () => ({ id: 'a', title: 'A', Screen: () => <p> })`)
  write('2', DICE_SOURCE)
  const { result } = watch()

  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(Object.keys(result.current.tools)).toEqual(['roll'])
})
