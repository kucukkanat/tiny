import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import {
  removeConversation,
  saveConversation,
  useConversations,
  type Conversation,
} from './conversations'
import type { ChatMessage } from './model'

const said = (text: string): ChatMessage[] => [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text }] },
]

/** Storage is only read while something is watching, so tests watch. */
const watch = async () => {
  const view = renderHook(useConversations)
  await waitFor(() => expect(view.result.current).toBeDefined())
  return view
}

const titles = (conversations: readonly Conversation[] | undefined) =>
  conversations?.map(({ title }) => title)

test('a saved conversation is titled by the first thing you said', async () => {
  const { result } = await watch()
  act(() => saveConversation('a', said('what is a monad')))

  expect(titles(result.current)).toEqual(['what is a monad'])
})

test('a conversation with nothing said in it still gets a name', async () => {
  const { result } = await watch()
  act(() =>
    saveConversation('a', [{ id: 'm1', role: 'assistant', parts: [] }] as ChatMessage[]),
  )

  expect(titles(result.current)).toEqual(['New chat'])
})

test('the one you touched last is on top', async () => {
  const { result } = await watch()
  act(() => saveConversation('a', said('first')))
  act(() => saveConversation('b', said('second')))
  act(() => saveConversation('a', said('first again')))

  expect(titles(result.current)).toEqual(['first again', 'second'])
})

test('deleting one leaves the rest', async () => {
  const { result } = await watch()
  act(() => saveConversation('a', said('keep')))
  act(() => saveConversation('b', said('drop')))
  act(() => removeConversation('b'))

  expect(titles(result.current)).toEqual(['keep'])
})

test('a conversation survives a reload', async () => {
  const first = await watch()
  act(() => saveConversation('a', said('still here')))
  first.unmount()

  const { result } = await watch()
  expect(result.current?.[0]?.messages).toEqual(said('still here'))
})

test('storage the SDK will not vouch for is dropped, not fatal', async () => {
  localStorage.setItem(
    'tiny.chat.conversations',
    JSON.stringify([
      { id: 'a', title: 'good', updatedAt: 2, messages: said('fine') },
      { id: 'b', title: 'bad', updatedAt: 1, messages: [{ nonsense: true }] },
    ]),
  )

  const { result } = await watch()
  expect(titles(result.current)).toEqual(['good'])
})

test('unparseable storage is an empty list', async () => {
  localStorage.setItem('tiny.chat.conversations', '{oh no')

  const { result } = await watch()
  expect(result.current).toEqual([])
})

test('a conversation saved before storage is read is not lost to it', async () => {
  localStorage.setItem(
    'tiny.chat.conversations',
    JSON.stringify([
      { id: 'old', title: 'from storage', updatedAt: 1, messages: said('old') },
    ]),
  )

  // No `await` — the save lands while hydration is still in flight.
  const { result } = renderHook(useConversations)
  act(() => saveConversation('new', said('just now')))

  await waitFor(() => expect(result.current).toHaveLength(2))
  expect(titles(result.current)).toEqual(['just now', 'from storage'])
})
