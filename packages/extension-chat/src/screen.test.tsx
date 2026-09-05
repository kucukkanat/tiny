import { render, screen } from '@testing-library/react'
import { expect, test } from 'bun:test'
import type { LanguageModel } from 'ai'
import type { Registry, Tiny } from '@tiny/host'
import { askUser } from '@tiny/host/app'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ChatScreen } from './screen'

// A model is a provider id or an SDK client; the id alone is enough to render.
const MODEL = 'test-model' as unknown as LanguageModel

const spec = {
  label: 'Test',
  baseUrl: 'https://test.dev',
  model: () => MODEL,
  models: () => Promise.resolve([]),
}

const host = (over: Partial<Tiny> = {}): Tiny => ({
  useChats: () => [],
  useModel: () => MODEL,
  ask: () => Promise.resolve(''),
  useTools: () => ({}),
  useInstructions: () => undefined,
  useActions: () => [],
  useProviders: (): Registry => ({ test: spec }),
  ...over,
})

// The name on the bar is the stored choice, which Settings writes and this reads.
const chose = () => localStorage.setItem('tiny.provider.model', 'test-model')

// The shell mounts it at `/chat/*` and its own routes below that.
const renderChat = (tiny = host(), at = '/chat/abc') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/chat/*" element={<ChatScreen tiny={tiny} />} />
      </Routes>
    </MemoryRouter>,
  )

test('with nothing to call, the thread gives way to where you set one up', async () => {
  renderChat(host({ useModel: () => undefined }))

  expect(await screen.findByTestId('chat-to-settings')).toBeDefined()
  expect(screen.queryByTestId('chat-input')).toBeNull()
})

// Settings can be switched off, and then its route does not exist — pointing at
// it would bounce off the catch-all and land you on a fresh conversation.
test('with no dialect at all, it points at the screen that is always there', async () => {
  renderChat(host({ useModel: () => undefined, useProviders: () => ({}) }))

  expect(await screen.findByTestId('chat-to-extensions')).toBeDefined()
  expect(screen.queryByTestId('chat-to-settings')).toBeNull()
})

test('with a model to call, you get a prompt', async () => {
  chose()
  renderChat()

  expect(await screen.findByTestId('chat-input')).toBeDefined()
  expect(screen.queryByTestId('chat-to-settings')).toBeNull()
})

test('a question a tool is waiting on is asked in the thread', async () => {
  chose()
  void askUser('Which city?')
  renderChat()

  expect((await screen.findByTestId('tool-question')).textContent).toContain(
    'Which city?',
  )
})

test('a stored conversation is on screen when you open it', async () => {
  chose()
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

test('landing on it without a conversation starts one', async () => {
  chose()
  renderChat(host(), '/chat')

  // A fresh conversation is an empty prompt, not the transcript of another one.
  expect(await screen.findByTestId('chat-input')).toBeDefined()
  expect(screen.queryByTestId('message-user')).toBeNull()
})
