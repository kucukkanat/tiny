import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { readTheme } from '@tiny/ui/lib/theme'
import { DEFAULT_BASE_URL, readProvider } from './provider'
import { SettingsScreen } from './screen'

const endpoint = () => screen.getByTestId<HTMLInputElement>('settings-base-url')

test('picking a different API leaves the endpoint you set alone', () => {
  render(<SettingsScreen />)
  fireEvent.change(endpoint(), { target: { value: 'http://localhost:1234/v1' } })
  fireEvent.click(screen.getByTestId('settings-kind-openai'))

  expect(endpoint().value).toBe('http://localhost:1234/v1')
  expect(readProvider().kind).toBe('openai')
})

test('the endpoint placeholder still offers the dialect default', () => {
  render(<SettingsScreen />)
  fireEvent.change(endpoint(), { target: { value: '' } })
  fireEvent.click(screen.getByTestId('settings-kind-openai'))

  expect(endpoint().getAttribute('placeholder')).toBe(DEFAULT_BASE_URL.openai)
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
