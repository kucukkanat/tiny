import { act, renderHook } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { applyTheme, readTheme, useTheme } from './theme'

const isDark = () => document.documentElement.classList.contains('dark')

test('nothing chosen means dark', () => {
  expect(readTheme()).toBe('dark')
})

test('junk in storage means dark', () => {
  localStorage.setItem('tiny.theme', 'sepia')
  expect(readTheme()).toBe('dark')
})

test('a choice survives a reload', () => {
  const { result, unmount } = renderHook(useTheme)
  act(() => result.current[1]('light'))
  unmount()

  expect(readTheme()).toBe('light')
})

test('choosing light takes the class off, choosing dark puts it back', () => {
  const { result } = renderHook(useTheme)

  act(() => result.current[1]('light'))
  expect(isDark()).toBe(false)

  act(() => result.current[1]('dark'))
  expect(isDark()).toBe(true)
})

test('system asks the device', () => {
  applyTheme('system')
  expect(isDark()).toBe(window.matchMedia('(prefers-color-scheme: dark)').matches)
})
