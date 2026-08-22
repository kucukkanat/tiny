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

test('switching provider drops the endpoint and model, keeping the key', () => {
  const { result } = renderHook(useProvider)
  act(() => result.current[1]({ apiKey: 'sk-test', model: 'claude-opus-5' }))
  act(() => result.current[1]({ kind: 'openai' }))

  expect(result.current[0]).toEqual({
    kind: 'openai',
    baseUrl: DEFAULT_BASE_URL.openai,
    apiKey: 'sk-test',
    model: '',
  })
})

test('a custom endpoint given with the switch wins', () => {
  const { result } = renderHook(useProvider)
  act(() => result.current[1]({ kind: 'openai', baseUrl: 'http://localhost:1234/v1' }))
  expect(result.current[0].baseUrl).toBe('http://localhost:1234/v1')
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
