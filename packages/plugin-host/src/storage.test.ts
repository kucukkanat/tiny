import { expect, test } from 'bun:test'
import { isExtensionId, isToolName, write } from './storage'

test('a tool name is what a provider will take', () => {
  expect(isToolName('get_weather')).toBe(true)
  expect(isToolName('get-weather-2')).toBe(true)
  expect(isToolName('')).toBe(false)
  expect(isToolName('get weather')).toBe(false)
  expect(isToolName('a'.repeat(65))).toBe(false)
})

test('an extension id is one lowercase path segment', () => {
  expect(isExtensionId('dice')).toBe(true)
  expect(isExtensionId('chat-plus')).toBe(true)
  expect(isExtensionId('Dice')).toBe(false)
  expect(isExtensionId('-dice')).toBe(false)
  expect(isExtensionId('two words')).toBe(false)
  expect(isExtensionId('a/b')).toBe(false)
  expect(isExtensionId('')).toBe(false)
})

// The failure half — a full store — has no test: happy-dom has no quota and its
// localStorage is a proxy that won't take a stub, and this repo doesn't mock.
test('a write that lands says so', () => {
  expect(write('tiny.probe', 'kept')).toBe(true)
  expect(localStorage.getItem('tiny.probe')).toBe('kept')
})
