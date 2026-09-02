import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import type { ChatMessage } from './model'
import { MessageParts, ReplyActions, Thinking } from './parts'

const show = (parts: ChatMessage['parts'], streaming = false) =>
  render(<MessageParts parts={parts} streaming={streaming} />)

test('text is rendered', () => {
  show([{ type: 'text', text: 'the answer' }])
  expect(document.body.textContent).toContain('the answer')
})

test('reasoning gets its own block, shut until you open it', () => {
  show([{ type: 'reasoning', text: 'first, consider', state: 'done' }])

  const block = screen.getByTestId<HTMLDetailsElement>('message-reasoning')
  expect(block.open).toBe(false)
  expect(block.textContent).toContain('Thought it through')
  expect(block.textContent).toContain('first, consider')
})

test('reasoning still coming in says so', () => {
  show([{ type: 'reasoning', text: 'weighing it up', state: 'streaming' }])
  expect(screen.getByTestId('message-reasoning').textContent).toContain('Thinking')
})

test('reasoning and the answer both show, in order', () => {
  show([
    { type: 'reasoning', text: 'thinking about it', state: 'done' },
    { type: 'text', text: 'the answer' },
  ])

  expect(screen.getByTestId('message-reasoning')).toBeDefined()
  expect(document.body.textContent).toContain('the answer')
})

test('a part with no UI behind it is skipped, not a crash', () => {
  show([
    { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,' },
    { type: 'text', text: 'still here' },
  ])

  expect(document.body.textContent).toContain('still here')
})

test('waiting on the first token says what it is doing', () => {
  render(<Thinking />)
  expect(screen.getByTestId('chat-thinking').textContent).toBe('Thinking')
})

test('a reply can be copied, and says when it has been', async () => {
  const copied: string[] = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => void copied.push(text) },
  })

  render(<ReplyActions text="the whole answer" />)
  const button = screen.getByTestId('message-copy')
  expect(button.textContent).toContain('Copy')

  fireEvent.click(button)
  expect(copied).toEqual(['the whole answer'])
  await waitFor(() => expect(button.textContent).toContain('Copied'))
})

test('the thinking row counts the seconds it has been waiting', async () => {
  render(<Thinking />)
  const row = screen.getByTestId('chat-thinking')
  expect(row.textContent).toBe('Thinking')

  await waitFor(() => expect(row.textContent).toBe('Thinking1s'), { timeout: 2500 })
})

test('a tool still running is named, so you know what it is waiting on', () => {
  show([
    {
      type: 'dynamic-tool',
      toolName: 'weather',
      toolCallId: 'call-1',
      state: 'input-available',
      input: { city: 'Istanbul' },
    },
  ])

  expect(screen.getByTestId('message-tool').textContent).toContain('weather')
})

test('a finished tool shows what went in and what came back', () => {
  show([
    {
      type: 'dynamic-tool',
      toolName: 'weather',
      toolCallId: 'call-1',
      state: 'output-available',
      input: { city: 'Istanbul' },
      output: { celsius: '19' },
    },
  ])

  const block = screen.getByTestId('message-tool')
  expect(block.textContent).toContain('Istanbul')
  expect(block.textContent).toContain('19')
})

test('a tool that failed says so instead of swallowing it', () => {
  show([
    {
      type: 'dynamic-tool',
      toolName: 'weather',
      toolCallId: 'call-1',
      state: 'output-error',
      input: { city: 'Istanbul' },
      errorText: 'wttr.in said 503',
    },
  ])

  const block = screen.getByTestId('message-tool')
  expect(block.textContent).toContain('weather failed')
  expect(block.textContent).toContain('wttr.in said 503')
})
