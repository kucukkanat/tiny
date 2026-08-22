import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { App } from './app'

test('an unknown route lands on the first plugin', async () => {
  window.location.hash = '#/nope'
  render(<App />)

  expect(await screen.findByTestId('chat-to-settings')).toBeDefined()
})

test('a plugin with a sidebar section gets one, and no footer link', async () => {
  render(<App />)

  expect(await screen.findByTestId('chat-list')).toBeDefined()
  expect(screen.queryByTestId('nav-chat')).toBeNull()
})

test('a plugin without a sidebar section is reachable from the footer', async () => {
  render(<App />)

  expect((await screen.findByTestId('nav-settings')).textContent).toBe('Settings')
})

const sidebar = () => document.querySelector('[data-slot="sidebar"]')

test('shutting the sidebar sticks across a reload', async () => {
  const first = render(<App />)
  fireEvent.click(await screen.findByTestId('sidebar-toggle'))
  await waitFor(() => expect(sidebar()?.getAttribute('data-state')).toBe('collapsed'))
  first.unmount()

  render(<App />)
  await waitFor(() => expect(sidebar()?.getAttribute('data-state')).toBe('collapsed'))
})
