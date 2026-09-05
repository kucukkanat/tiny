import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import type { LanguageModel } from 'ai'
import type { Registry, Thread, Tiny } from '@tiny/host'
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
  useMessageActions: () => [],
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

test('an extension gets a button under both sides, and the thread with it', async () => {
  chose()
  localStorage.setItem(
    'tiny.chat.abc',
    JSON.stringify({
      id: 'abc',
      title: 'earlier',
      updatedAt: 1,
      messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'earlier' }] },
        { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'the answer' }] },
      ],
    }),
  )

  const seen: Thread[] = []
  renderChat(
    host({
      useMessageActions: () => [
        { label: 'Keep', run: (_message, thread) => void seen.push(thread) },
      ],
    }),
  )

  // Both sides get a footer now, so yours has a Copy it did not have before.
  await waitFor(() => expect(screen.getAllByTestId('message-copy')).toHaveLength(2))

  const [mine] = screen.getAllByTestId('message-action-keep')
  fireEvent.click(mine as HTMLElement)
  expect(seen[0]?.title).toBe('earlier')
  expect(seen[0]?.model).toBe('test-model')
  expect(seen[0]?.messages.map(({ role, text }) => [role, text])).toEqual([
    ['user', 'earlier'],
    ['assistant', 'the answer'],
  ])
})

test('one send per press: the second is refused, not queued behind the first', async () => {
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

  // Two sends at once do not lose a reply — they interleave and write both into
  // the one conversation — so the second has to be refused where it is made.
  const tried: string[] = []
  const say = (thread: Thread, text: string) => {
    try {
      thread.send(text)
      tried.push('sent')
    } catch (cause) {
      tried.push(cause instanceof Error ? cause.message : String(cause))
    }
  }

  renderChat(
    host({
      useMessageActions: () => [
        {
          label: 'Twice',
          run: (_message, thread) => {
            say(thread, 'one')
            say(thread, 'two')
          },
        },
      ],
    }),
  )

  const button = await screen.findByTestId('message-action-twice')
  await act(async () => void fireEvent.click(button))
  expect(tried).toEqual(['sent', 'The model is still answering.'])
})

test('landing on it without a conversation starts one', async () => {
  chose()
  renderChat(host(), '/chat')

  // A fresh conversation is an empty prompt, not the transcript of another one.
  expect(await screen.findByTestId('chat-input')).toBeDefined()
  expect(screen.queryByTestId('message-user')).toBeNull()
})
