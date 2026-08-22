import { render, screen } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ChatScreen } from './screen'

// The shell mounts the plugin at `/chat/*` and the plugin routes below that.
const renderChat = (at = '/chat/abc') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/chat/*" element={<ChatScreen />} />
      </Routes>
    </MemoryRouter>,
  )

const configured = () => {
  localStorage.setItem('tiny.provider.kind', 'openai')
  localStorage.setItem('tiny.provider.baseUrl', 'http://localhost:1234/v1')
  localStorage.setItem('tiny.provider.apiKey', 'sk-test')
  localStorage.setItem('tiny.provider.model', 'llama-3.3-70b')
}

test('an unconfigured provider sends you to settings instead of a prompt', async () => {
  renderChat()

  expect(await screen.findByTestId('chat-to-settings')).toBeDefined()
  expect(screen.queryByTestId('chat-input')).toBeNull()
})

test('a configured provider gets a prompt', async () => {
  configured()
  renderChat()

  expect(await screen.findByTestId('chat-input')).toBeDefined()
  expect(screen.queryByTestId('chat-to-settings')).toBeNull()
})

test('a stored conversation is on screen when you open it', async () => {
  configured()
  localStorage.setItem(
    'tiny.chat.abc',
    JSON.stringify({
      id: 'abc',
      title: 'earlier',
      updatedAt: 1,
      messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'earlier' }] }],
    }),
  )

  renderChat()
  expect((await screen.findByTestId('message-user')).textContent).toContain('earlier')
})

test('landing on the plugin without a conversation starts one', async () => {
  configured()
  renderChat('/chat')

  // A fresh conversation is an empty prompt, not the transcript of another one.
  expect(await screen.findByTestId('chat-input')).toBeDefined()
  expect(screen.queryByTestId('message-user')).toBeNull()
})
