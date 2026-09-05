import { act, renderHook } from '@testing-library/react'
import { expect, test } from 'bun:test'
import type { ProviderSpec } from '@tiny/host'
// The store moved into the host; the fixtures it is worth testing against are
// the dialects this package ships, so the test stays here.
import { hasCredentials, isUsable, readProvider, useProvider } from '@tiny/host/app'
import type { Registry } from '@tiny/host'
import { providers } from './providers'

const watch = (specs: Registry = providers) => renderHook(() => useProvider(specs))

/** A dialect an extension brought, so it can be taken away again. */
const gemini: ProviderSpec = {
  label: 'Gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  model: () => 'gemini',
  models: () => Promise.resolve([]),
}

test('defaults to Anthropic with nothing filled in', () => {
  expect(readProvider(providers)).toEqual({
    kind: 'anthropic',
    baseUrl: providers.anthropic.baseUrl,
    apiKey: '',
    model: '',
  })
})

test('survives a reload', () => {
  const { result, unmount } = watch()
  act(() => result.current[1]({ kind: 'openai', baseUrl: 'http://localhost:1234/v1' }))
  act(() => result.current[1]({ apiKey: 'sk-test', model: 'llama-3.3-70b' }))
  unmount()

  expect(readProvider(providers)).toEqual({
    kind: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    apiKey: 'sk-test',
    model: 'llama-3.3-70b',
  })
})

test('switching dialect leaves the endpoint, key and model where they are', () => {
  const { result } = watch()
  act(() =>
    result.current[1]({
      baseUrl: 'http://localhost:1234/v1',
      apiKey: 'sk-test',
      model: 'claude-opus-5',
    }),
  )
  act(() => result.current[1]({ kind: 'openai' }))

  // A local server can speak both dialects; switching is not a reason to
  // forget which one you pointed at.
  expect(result.current[0]).toEqual({
    kind: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    apiKey: 'sk-test',
    model: 'claude-opus-5',
  })
})

test('an emptied endpoint falls back to the dialect default', () => {
  const { result, unmount } = watch()
  act(() => result.current[1]({ kind: 'openai', baseUrl: '' }))
  unmount()

  expect(readProvider(providers).baseUrl).toBe(providers.openai.baseUrl)
})

test('credentials are enough to list models, but not to call one', () => {
  const withKey = {
    kind: 'openai',
    baseUrl: 'https://x.dev/v1',
    apiKey: 'sk-test',
  } as const
  expect(hasCredentials({ ...withKey, model: '' })).toBe(true)
  expect(isUsable({ ...withKey, model: '' }, providers)).toBe(false)
  expect(isUsable({ ...withKey, model: 'gpt-5' }, providers)).toBe(true)
})

test('unusable without a key or with a broken endpoint', () => {
  expect(hasCredentials(readProvider(providers))).toBe(false)
  expect(
    hasCredentials({
      kind: 'openai',
      baseUrl: 'not a url',
      apiKey: 'sk-test',
      model: 'gpt-5',
    }),
  ).toBe(false)
})

test('a dialect nothing answers to is unusable, but is still what you chose', () => {
  const withGemini = { ...providers, gemini }
  const view = watch(withGemini)
  act(() =>
    view.result.current[1]({ kind: 'gemini', apiKey: 'sk-test', model: 'gemini-3' }),
  )
  expect(isUsable(view.result.current[0], withGemini)).toBe(true)

  // The extension goes away — mid-session, or because it is still loading.
  view.rerender()
  const without = watch(providers)
  expect(without.result.current[0].kind).toBe('gemini')
  expect(isUsable(without.result.current[0], providers)).toBe(false)
})

test('a patch while a dialect is missing does not overwrite the one you chose', () => {
  const view = watch({ ...providers, gemini })
  act(() => view.result.current[1]({ kind: 'gemini' }))
  view.unmount()

  // Settings is open with gemini unavailable, and something else is edited.
  const offline = watch(providers)
  act(() => offline.result.current[1]({ model: 'whatever' }))
  offline.unmount()

  expect(readProvider({ ...providers, gemini }).kind).toBe('gemini')
})

test('two watchers see the same provider, so Settings and chat agree', () => {
  const first = watch()
  const second = watch()
  act(() => first.result.current[1]({ model: 'claude-opus-5' }))

  expect(second.result.current[0].model).toBe('claude-opus-5')
})
