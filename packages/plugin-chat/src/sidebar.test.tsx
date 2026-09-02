import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SidebarProvider } from '@tiny/ui/components/sidebar'
import { expect, test } from 'bun:test'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { saveConversation } from './conversations'
import type { ChatMessage } from './model'
import { ChatSidebar } from './sidebar'

const said = (text: string): ChatMessage[] => [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text }] },
]

const Path = () => <span data-testid="path">{useLocation().pathname}</span>

const renderSidebar = (at = '/chat/a') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <SidebarProvider>
        <ChatSidebar />
      </SidebarProvider>
      <Routes>
        <Route path="*" element={<Path />} />
      </Routes>
    </MemoryRouter>,
  )

const path = () => screen.getByTestId('path').textContent

test('nothing to show says so', async () => {
  renderSidebar()
  expect(await screen.findByTestId('chat-list-empty')).toBeDefined()
})

test('every conversation is a row you can open', async () => {
  renderSidebar()
  act(() => saveConversation('a', said('older')))
  act(() => saveConversation('b', said('newer')))

  const rows = await screen.findAllByTestId(/^chat-open-/)
  expect(rows.map((row) => row.textContent)).toEqual(['newer', 'older'])

  fireEvent.click(rows[1] as HTMLElement)
  expect(path()).toBe('/chat/a')
})

test('the one you are reading is marked', async () => {
  renderSidebar('/chat/a')
  act(() => saveConversation('a', said('this one')))

  expect((await screen.findByTestId('chat-open-a')).getAttribute('data-active')).toBe(
    'true',
  )
})

test('deleting the conversation you are in moves you to a new one', async () => {
  renderSidebar('/chat/a')
  act(() => saveConversation('a', said('doomed')))

  fireEvent.click(await screen.findByTestId('chat-delete-a'))

  expect(screen.queryByTestId('chat-open-a')).toBeNull()
  await waitFor(() => expect(path()).not.toBe('/chat/a'))
  expect(path()).toStartWith('/chat/')
})

test('deleting a conversation you are not in leaves you where you are', async () => {
  renderSidebar('/chat/a')
  act(() => saveConversation('a', said('reading')))
  act(() => saveConversation('b', said('doomed')))

  fireEvent.click(await screen.findByTestId('chat-delete-b'))

  expect(path()).toBe('/chat/a')
  expect(screen.queryByTestId('chat-open-b')).toBeNull()
})

test('new chat takes you somewhere you have not been', async () => {
  renderSidebar('/chat/a')
  fireEvent.click(await screen.findByTestId('chat-new'))

  expect(path()).toStartWith('/chat/')
  expect(path()).not.toBe('/chat/a')
})

test('search cuts the list down to what matches', async () => {
  renderSidebar()
  act(() => saveConversation('a', said('what is a monad')))
  act(() => saveConversation('b', said('best pasta shape')))

  fireEvent.change(await screen.findByTestId('chat-search'), {
    target: { value: 'monad' },
  })

  const rows = await screen.findAllByTestId(/^chat-open-/)
  expect(rows.map((row) => row.textContent)).toEqual(['what is a monad'])
})

test('a search that matches nothing says so, and says what', async () => {
  renderSidebar()
  act(() => saveConversation('a', said('one')))
  act(() => saveConversation('b', said('two')))

  fireEvent.change(await screen.findByTestId('chat-search'), {
    target: { value: 'three' },
  })

  expect((await screen.findByTestId('chat-list-no-match')).textContent).toBe(
    'Nothing matches "three".',
  )
  expect(screen.queryByTestId('chat-list-empty')).toBeNull()
})

test('one chat is not a list worth searching', async () => {
  renderSidebar()
  act(() => saveConversation('a', said('alone')))

  await screen.findByTestId('chat-open-a')
  expect(screen.queryByTestId('chat-search')).toBeNull()
})

const swipe = (
  id: string,
  {
    dx,
    dy = 0,
    pointerType = 'touch',
  }: { dx: number; dy?: number; pointerType?: string },
) => {
  const row = screen.getByTestId(`chat-open-${id}`)
  fireEvent.pointerDown(row, { pointerType, clientX: 200, clientY: 100 })
  fireEvent.pointerMove(row, { pointerType, clientX: 200 - dx, clientY: 100 + dy })
  fireEvent.pointerUp(row, { pointerType })
}

const uncovered = (id: string) =>
  screen.getByTestId(`chat-row-${id}`).getAttribute('data-swiped') === 'true'

test('swiping a row aside uncovers its delete', async () => {
  renderSidebar()
  act(() => saveConversation('a', said('swipe me')))
  await screen.findByTestId('chat-open-a')

  swipe('a', { dx: 60 })
  expect(uncovered('a')).toBe(true)
})

test('a swipe that changes its mind puts the row back', async () => {
  renderSidebar()
  act(() => saveConversation('a', said('nearly')))
  await screen.findByTestId('chat-open-a')

  swipe('a', { dx: 20 })
  expect(uncovered('a')).toBe(false)
})

test('scrolling the list past a row does not open it', async () => {
  renderSidebar()
  act(() => saveConversation('a', said('scrolling by')))
  await screen.findByTestId('chat-open-a')

  swipe('a', { dx: 12, dy: 40 })
  expect(uncovered('a')).toBe(false)
})

test('a mouse drag is not a swipe — a pointer gets hover instead', async () => {
  renderSidebar()
  act(() => saveConversation('a', said('with a mouse')))
  await screen.findByTestId('chat-open-a')

  swipe('a', { dx: 60, pointerType: 'mouse' })
  expect(uncovered('a')).toBe(false)
})

test('only one row sits open at a time', async () => {
  renderSidebar()
  act(() => saveConversation('a', said('first')))
  act(() => saveConversation('b', said('second')))
  await screen.findByTestId('chat-open-a')

  swipe('a', { dx: 60 })
  swipe('b', { dx: 60 })

  expect(uncovered('a')).toBe(false)
  expect(uncovered('b')).toBe(true)
})

test('tapping an open row puts it back rather than opening the chat', async () => {
  renderSidebar('/chat/x')
  act(() => saveConversation('a', said('careful')))
  await screen.findByTestId('chat-open-a')
  swipe('a', { dx: 60 })

  fireEvent.click(screen.getByTestId('chat-open-a'))

  expect(uncovered('a')).toBe(false)
  expect(path()).toBe('/chat/x')
})
