import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { readTheme } from '@tiny/ui/lib/theme'
import type { ProviderSpec } from '@tiny/plugin-host'
import { readProvider, type Registry } from './provider'
import { providers } from './providers'
import { SettingsScreen } from './screen'

const endpoint = () => screen.getByTestId<HTMLInputElement>('settings-base-url')

const renderSettings = (specs: Registry = providers) =>
  render(<SettingsScreen useProviders={() => specs} />)

test('picking a different API leaves the endpoint you set alone', () => {
  renderSettings()
  fireEvent.change(endpoint(), { target: { value: 'http://localhost:1234/v1' } })
  fireEvent.click(screen.getByTestId('settings-kind-openai'))

  expect(endpoint().value).toBe('http://localhost:1234/v1')
  expect(readProvider(providers).kind).toBe('openai')
})

test('the endpoint placeholder still offers the dialect default', () => {
  renderSettings()
  fireEvent.change(endpoint(), { target: { value: '' } })
  fireEvent.click(screen.getByTestId('settings-kind-openai'))

  expect(endpoint().getAttribute('placeholder')).toBe(providers.openai.baseUrl)
})

test('the model list cannot be loaded without credentials', () => {
  renderSettings()
  expect(screen.getByTestId('settings-load-models').hasAttribute('disabled')).toBe(true)
})

test('typing a key stores it', () => {
  renderSettings()
  fireEvent.change(screen.getByTestId('settings-api-key'), {
    target: { value: 'sk-test' },
  })

  expect(readProvider(providers).apiKey).toBe('sk-test')
})

test('a broken endpoint says so', () => {
  renderSettings()
  fireEvent.change(endpoint(), { target: { value: 'not a url' } })

  expect(screen.getByTestId('settings-base-url-hint').textContent).toBe(
    'That is not a URL.',
  )
  expect(endpoint().getAttribute('aria-invalid')).toBe('true')
})

test('picking a theme stores it', () => {
  renderSettings()
  fireEvent.click(screen.getByTestId('settings-theme-light'))

  expect(readTheme()).toBe('light')
  expect(document.documentElement.classList.contains('dark')).toBe(false)
})

/** A dialect an extension brought. */
const gemini: ProviderSpec = {
  label: 'Gemini',
  baseUrl: 'https://gemini.dev/v1',
  model: () => 'gemini',
  models: () => Promise.resolve(['gemini-3']),
}

test('a dialect an extension added is on the toggle', () => {
  renderSettings({ ...providers, gemini })
  expect(screen.getByTestId('settings-kind-gemini').textContent).toContain('Gemini')
})

test('what ships comes first, so an extension cannot lead the list', () => {
  renderSettings({ ...providers, gemini })
  const kinds = [...document.querySelectorAll('[data-testid^="settings-kind-"]')].map(
    (item) => item.getAttribute('data-testid'),
  )

  expect(kinds).toEqual([
    'settings-kind-anthropic',
    'settings-kind-openai',
    'settings-kind-gemini',
  ])
})

test('a dialect that is gone is still shown, so you can see what you picked', () => {
  localStorage.setItem('tiny.provider.kind', 'gemini')
  renderSettings()

  expect(screen.getByTestId('settings-kind-gemini').textContent).toContain('not loaded')
  expect(screen.getByTestId('settings-base-url-hint').textContent).toContain(
    'Nothing here answers to gemini',
  )
})

test('an endpoint that will not answer says why, in its own words', async () => {
  const angry: ProviderSpec = {
    ...gemini,
    models: () => Promise.reject(new Error('gemini.dev said 401 Unauthorized')),
  }
  localStorage.setItem('tiny.provider.kind', 'gemini')
  renderSettings({ ...providers, gemini: angry })
  fireEvent.change(screen.getByTestId('settings-api-key'), {
    target: { value: 'sk-test' },
  })
  fireEvent.click(screen.getByTestId('settings-load-models'))

  await waitFor(() =>
    expect(screen.getByTestId('settings-model-hint').textContent).toBe(
      'gemini.dev said 401 Unauthorized',
    ),
  )
})
