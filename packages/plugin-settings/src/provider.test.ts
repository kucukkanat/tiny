import { act, renderHook } from '@testing-library/react'
import { expect, test } from 'bun:test'
import {
  DEFAULT_BASE_URL,
  hasCredentials,
  isUsable,
  readProvider,
  useProvider,
} from './provider'

test('defaults to Anthropic with nothing filled in', () => {
  expect(readProvider()).toEqual({
    kind: 'anthropic',
    baseUrl: DEFAULT_BASE_URL.anthropic,
    apiKey: '',
    model: '',
  })
})

test('junk in storage falls back to the default', () => {
  localStorage.setItem('tiny.provider.kind', 'gopher')
  expect(readProvider().kind).toBe('anthropic')
})

test('survives a reload', () => {
  const { result, unmount } = renderHook(useProvider)
  act(() => result.current[1]({ kind: 'openai', baseUrl: 'http://localhost:1234/v1' }))
  act(() => result.current[1]({ apiKey: 'sk-test', model: 'llama-3.3-70b' }))
  unmount()

  expect(readProvider()).toEqual({
    kind: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    apiKey: 'sk-test',
    model: 'llama-3.3-70b',
  })
})

test('switching dialect leaves the endpoint, key and model where they are', () => {
  const { result } = renderHook(useProvider)
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
  const { result, unmount } = renderHook(useProvider)
  act(() => result.current[1]({ kind: 'openai', baseUrl: '' }))
  unmount()

  expect(readProvider().baseUrl).toBe(DEFAULT_BASE_URL.openai)
})

test('credentials are enough to list models, but not to call one', () => {
  const withKey = {
    kind: 'openai',
    baseUrl: 'https://x.dev/v1',
    apiKey: 'sk-test',
  } as const
  expect(hasCredentials({ ...withKey, model: '' })).toBe(true)
  expect(isUsable({ ...withKey, model: '' })).toBe(false)
  expect(isUsable({ ...withKey, model: 'gpt-5' })).toBe(true)
})

test('unusable without a key or with a broken endpoint', () => {
  expect(hasCredentials(readProvider())).toBe(false)
  expect(
    hasCredentials({
      kind: 'openai',
      baseUrl: 'not a url',
      apiKey: 'sk-test',
      model: 'gpt-5',
    }),
  ).toBe(false)
})
