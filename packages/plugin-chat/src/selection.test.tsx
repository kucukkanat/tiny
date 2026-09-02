import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { SelectionActions } from './selection'

const picked: string[] = []

/** A message on screen, with the passage inside it selected. */
const selectInside = (testid: string, text: string) => {
  picked.length = 0
  render(
    <>
      <div data-testid={testid}>{text}</div>
      <SelectionActions onPick={(prompt) => picked.push(prompt)} />
    </>,
  )

  const range = document.createRange()
  range.selectNodeContents(screen.getByTestId(testid))
  // Selecting fires `selectionchange` on its own, the way a browser does.
  act(() => {
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
}

const take = (action: string) =>
  act(() => void fireEvent.click(screen.getByTestId(`selection-${action}`)))

test('selecting inside a reply offers to hand it back', () => {
  selectInside('message-assistant', 'pistachio holds the top slot')
  take('explain')

  expect(picked).toEqual(['Explain this:\n\n> pistachio holds the top slot'])
})

test('each action asks for something different', () => {
  selectInside('message-assistant', 'some words')
  take('shorten')

  expect(picked).toEqual(['Shorten this:\n\n> some words'])
})

test('the offer goes away once it has been taken', () => {
  selectInside('message-assistant', 'some words')
  take('improve')

  expect(screen.queryByTestId('selection-improve')).toBeNull()
})

test('selecting your own message offers nothing', () => {
  selectInside('message-user', 'what i asked')

  expect(screen.queryByTestId('selection-explain')).toBeNull()
})

test('no selection, no offer', () => {
  picked.length = 0
  render(<SelectionActions onPick={(prompt) => picked.push(prompt)} />)
  act(() => document.getSelection()?.removeAllRanges())

  expect(screen.queryByTestId('selection-explain')).toBeNull()
})
