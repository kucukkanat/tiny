import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { readTheme } from '@tiny/ui/lib/theme'
import { DEFAULT_BASE_URL, readProvider } from './provider'
import { SettingsScreen } from './screen'

const endpoint = () => screen.getByTestId<HTMLInputElement>('settings-base-url')

test('picking a provider fills in its endpoint', () => {
  render(<SettingsScreen />)
  fireEvent.click(screen.getByTestId('settings-kind-openai'))

  expect(endpoint().value).toBe(DEFAULT_BASE_URL.openai)
  expect(readProvider().kind).toBe('openai')
})

test('the model list cannot be loaded without credentials', () => {
  render(<SettingsScreen />)
  expect(screen.getByTestId('settings-load-models').hasAttribute('disabled')).toBe(true)
})

test('typing a key stores it', () => {
  render(<SettingsScreen />)
  fireEvent.change(screen.getByTestId('settings-api-key'), {
    target: { value: 'sk-test' },
  })

  expect(readProvider().apiKey).toBe('sk-test')
})

test('a broken endpoint says so', () => {
  render(<SettingsScreen />)
  fireEvent.change(endpoint(), { target: { value: 'not a url' } })

  expect(screen.getByTestId('settings-base-url-hint').textContent).toBe(
    'That is not a URL.',
  )
  expect(endpoint().getAttribute('aria-invalid')).toBe('true')
})

test('picking a theme stores it', () => {
  render(<SettingsScreen />)
  fireEvent.click(screen.getByTestId('settings-theme-light'))

  expect(readTheme()).toBe('light')
  expect(document.documentElement.classList.contains('dark')).toBe(false)
})
