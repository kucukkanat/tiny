import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { askUser } from './ask'
import { ToolQuestions } from './questions'

const answer = (text: string) => {
  fireEvent.change(screen.getByTestId('tool-answer'), { target: { value: text } })
  fireEvent.click(screen.getByTestId('tool-answer-send'))
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

test('nothing to say, nothing to send', () => {
  const asked = askUser('Well?')
  render(<ToolQuestions />)

  fireEvent.change(screen.getByTestId('tool-answer'), { target: { value: '   ' } })
  expect(screen.getByTestId('tool-answer-send').hasAttribute('disabled')).toBe(true)

  answer('done')
  return asked
})

test('nothing is waiting, so nothing is in the way', () => {
  render(<ToolQuestions />)
  expect(screen.queryByTestId('tool-question')).toBeNull()
})
