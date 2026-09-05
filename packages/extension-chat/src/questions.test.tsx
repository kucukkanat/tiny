import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { askUser } from '@tiny/host/app'
import { ToolQuestions } from './questions'

const type = (text: string) =>
  fireEvent.change(screen.getByTestId('tool-answer'), { target: { value: text } })

const answer = (text: string) => {
  type(text)
  fireEvent.click(screen.getByTestId('tool-continue'))
}

test('a tool that asks gets what you type back', async () => {
  const asked = askUser('Which city are you in?')
  render(<ToolQuestions />)

  expect(screen.getByTestId('tool-question').textContent).toContain(
    'Which city are you in?',
  )

  answer('Istanbul')
  expect(await asked).toBe('Istanbul')
  await waitFor(() => expect(screen.queryByTestId('tool-question')).toBeNull())
})

test('a tool that offers choices gets the one you picked', async () => {
  const asked = askUser('How many flavours?', ['Three', 'Five'])
  render(<ToolQuestions />)

  const five = screen.getByTestId('tool-option-1')
  expect(five.getAttribute('aria-pressed')).toBe('false')

  fireEvent.click(five)
  expect(five.getAttribute('aria-pressed')).toBe('true')

  fireEvent.click(screen.getByTestId('tool-continue'))
  expect(await asked).toBe('Five')
})

test('a choice is an offer, not a cage', async () => {
  const asked = askUser('How many flavours?', ['Three', 'Five'])
  render(<ToolQuestions />)

  fireEvent.click(screen.getByTestId('tool-option-0'))
  answer('Seven')

  expect(await asked).toBe('Seven')
})

test('nothing to say, nothing to send', () => {
  const asked = askUser('Well?')
  render(<ToolQuestions />)

  type('   ')
  expect(screen.getByTestId('tool-continue').hasAttribute('disabled')).toBe(true)

  answer('done')
  return asked
})

test('skipping answers, because a tool left waiting never returns', async () => {
  const asked = askUser('Well?')
  render(<ToolQuestions />)

  fireEvent.click(screen.getByTestId('tool-skip'))
  expect(await asked).toBe('')
})

test('questions queue up one card at a time and page between them', async () => {
  const first = askUser('First?')
  const second = askUser('Second?')
  render(<ToolQuestions />)

  const card = screen.getByTestId('tool-question')
  expect(card.textContent).toContain('First?')
  expect(card.textContent).toContain('1 / 2')
  expect(screen.getByTestId('tool-previous').hasAttribute('disabled')).toBe(true)

  fireEvent.click(screen.getByTestId('tool-next'))
  expect(screen.getByTestId('tool-question').textContent).toContain('Second?')

  answer('two')
  expect(await second).toBe('two')

  // Answering the last one leaves the first still waiting, and on screen.
  await waitFor(() =>
    expect(screen.getByTestId('tool-question').textContent).toContain('First?'),
  )
  answer('one')
  expect(await first).toBe('one')
})

test('nothing is waiting, so nothing is in the way', () => {
  render(<ToolQuestions />)
  expect(screen.queryByTestId('tool-question')).toBeNull()
})
