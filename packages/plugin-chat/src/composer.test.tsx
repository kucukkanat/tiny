import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'bun:test'
import type { ChatStatus } from 'ai'
import { Composer } from './composer'

const sent: string[] = []
const stopped: string[] = []

const renderComposer = (status: ChatStatus = 'ready') => {
  sent.length = 0
  stopped.length = 0
  render(
    <Composer
      placeholder="Message it"
      status={status}
      onSend={(text) => sent.push(text)}
      onStop={() => stopped.push('stop')}
    />,
  )
  return screen.getByTestId<HTMLTextAreaElement>('chat-input')
}

const type = (input: HTMLTextAreaElement, value: string) =>
  fireEvent.change(input, { target: { value } })

test('enter sends what you typed and empties the box', () => {
  const input = renderComposer()
  type(input, 'what is a monad')
  fireEvent.keyDown(input, { key: 'Enter' })

  expect(sent).toEqual(['what is a monad'])
  expect(input.value).toBe('')
})

test('shift-enter is a new line, not a send', () => {
  const input = renderComposer()
  type(input, 'first line')
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

  expect(sent).toEqual([])
  expect(input.value).toBe('first line')
})

test('nothing to say, nothing to send', () => {
  const input = renderComposer()
  type(input, '   ')
  fireEvent.keyDown(input, { key: 'Enter' })

  expect(sent).toEqual([])
  expect(screen.getByTestId('chat-send').hasAttribute('disabled')).toBe(true)
})

test('the button stops the reply instead of sending another', () => {
  const input = renderComposer('streaming')
  type(input, 'ignored')
  fireEvent.click(screen.getByTestId('chat-send'))
  fireEvent.keyDown(input, { key: 'Enter' })

  expect(stopped).toEqual(['stop'])
  expect(sent).toEqual([])
})
