import { render, screen } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ChatScreen, type ChatOptions } from './screen'

// A model is a provider id or an SDK client; the id alone is enough to render.
const configured: ChatOptions = {
  useModel: () => ({
    model: 'test-model',
    name: 'test-model',
    names: ['test-model'],
    select: () => {},
  }),
}

// The shell mounts the plugin at `/chat/*` and the plugin routes below that.
const renderChat = (options = configured, at = '/chat/abc') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/chat/*" element={<ChatScreen {...options} />} />
      </Routes>
    </MemoryRouter>,
  )

test('with nothing to call, the thread gives way to whatever the shell offers', async () => {
  renderChat({
    useModel: () => undefined,
    unconfigured: <p data-testid="chat-unconfigured">Set one up first.</p>,
  })

  expect(await screen.findByTestId('chat-unconfigured')).toBeDefined()
  expect(screen.queryByTestId('chat-input')).toBeNull()
})

test('with a model to call, you get a prompt', async () => {
  renderChat()

  expect(await screen.findByTestId('chat-input')).toBeDefined()
  expect(screen.queryByTestId('chat-unconfigured')).toBeNull()
})

test('the panel slot renders in the conversation', async () => {
  renderChat({ ...configured, Panel: () => <p data-testid="chat-panel">asking</p> })

  expect(await screen.findByTestId('chat-panel')).toBeDefined()
})

test('a stored conversation is on screen when you open it', async () => {
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
  renderChat(configured, '/chat')

  // A fresh conversation is an empty prompt, not the transcript of another one.
  expect(await screen.findByTestId('chat-input')).toBeDefined()
  expect(screen.queryByTestId('message-user')).toBeNull()
})
