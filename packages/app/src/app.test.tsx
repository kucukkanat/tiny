import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { App } from './app'

test('an unknown route lands on the first screen there is', async () => {
  window.location.hash = '#/nope'
  render(<App />)

  expect(await screen.findByTestId('chat-to-settings')).toBeDefined()
})

test('one with a sidebar section gets one, and no footer link', async () => {
  render(<App />)

  expect(await screen.findByTestId('chat-list')).toBeDefined()
  expect(screen.queryByTestId('nav-chat')).toBeNull()
})

test('one without a sidebar section is reachable from the footer', async () => {
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

/** An extension, as one actually arrives: a module fetched at runtime. */
const install = (id: string, body: string, enabled = true) => {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }))
  localStorage.setItem(
    `tiny.extension.${id}`,
    JSON.stringify({ id, url, title: id, version: 1, enabled }),
  )
}

// No JSX and no `react` import: a fixture cannot resolve a bare specifier here,
// and what matters is that the shell routes to it, not what it paints.
const withScreen = (id: string, title: string) =>
  `export default () => ({ id: '${id}', title: '${title}', Screen: () => null })`

const header = () => document.querySelector('header')?.textContent ?? ''

/**
 * An extension arrives from an `import()`, which settles outside anything React
 * is scheduling, so a test has to let that land before it looks.
 */
const settle = async (until: () => boolean) => {
  for (let tries = 0; tries < 50 && !until(); tries++)
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 5))))
}

test('an extension that is on gets a route and a way in', async () => {
  install('1', withScreen('recap', 'Recap'))
  render(<App />)
  await settle(() => screen.queryByTestId('nav-recap') !== null)

  fireEvent.click(screen.getByTestId('nav-recap'))
  expect(header()).toContain('Recap')
  expect(window.location.hash).toBe('#/recap')
})

test('reloading on an extension route waits for it instead of bouncing home', async () => {
  install('1', withScreen('recap', 'Recap'))
  window.location.hash = '#/recap'
  render(<App />)

  // The route does not exist on the first render — it is still being fetched.
  // Sending the user home would lose the page they reloaded on.
  await settle(() => header().includes('Recap'))
  expect(header()).toContain('Recap')
  expect(window.location.hash).toBe('#/recap')
})

test('a route no extension claims still lands on the first screen', async () => {
  install('1', withScreen('recap', 'Recap'))
  window.location.hash = '#/nope'
  render(<App />)

  expect(await screen.findByTestId('chat-to-settings')).toBeDefined()
})

test('an extension id that merely starts like a built-in is its own screen', async () => {
  install('1', withScreen('chat-plus', 'Chat Plus'))
  window.location.hash = '#/chat-plus'
  render(<App />)

  // `"/chat-plus".startsWith("/chat")`, which is why the shell matches segments:
  // if it had matched `/chat`, the header would read "Chat" and show its thread.
  await settle(() => header().includes('Chat Plus'))
  expect(header()).toContain('Chat Plus')
  expect(screen.queryByTestId('chat-input')).toBeNull()
})

// What ships is switchable like anything else, and `home` is derived rather
// than fixed: pointed at a route with no `<Route>`, the catch-all would match
// itself again.
test('switching off what ships takes its route and its sidebar with it', async () => {
  localStorage.setItem('tiny.extensions.off', JSON.stringify(['chat']))
  window.location.hash = '#/chat/abc'
  render(<App />)

  await settle(() => screen.queryByTestId('nav-settings') !== null)
  expect(screen.queryByTestId('chat-list')).toBeNull()
  expect(screen.queryByTestId('chat-input')).toBeNull()
  // Settings leads what is left, so that is where an unclaimed route lands.
  expect(header()).toContain('Settings')
})

test('a screen that throws says so and leaves the rest of the app standing', async () => {
  install(
    '1',
    `export default () => ({
      id: 'bad', title: 'Bad',
      Screen: () => { throw new Error('nope') },
    })`,
  )
  window.location.hash = '#/bad'
  render(<App />)

  // Once it has loaded, its screen is what the route renders — and it throws.
  await settle(() => screen.queryByTestId('crashed') !== null)
  expect(screen.getByTestId('crashed').textContent).toContain('nope')
  // The sidebar is how you get away from it, so it has to still be there.
  expect(screen.getByTestId('chat-list')).toBeDefined()
})
