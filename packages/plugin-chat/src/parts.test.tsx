import { render, screen } from '@testing-library/react'
import { expect, test } from 'bun:test'
import type { ChatMessage } from './model'
import { MessageParts, Thinking } from './parts'

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
