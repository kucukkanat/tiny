import { render, screen } from '@testing-library/react'
import { expect, test } from 'bun:test'
import type { ComponentType } from 'react'
import { MemoryRouter } from 'react-router'
import author from './index'

const View = author().tools?.write_extension?.View as ComponentType<{
  input: unknown
  output: unknown
}>

const draw = (output: unknown) =>
  render(
    <MemoryRouter initialEntries={['/chat/abc']}>
      <View input={{}} output={output} />
    </MemoryRouter>,
  )

test('a new one says it is off, and links to the switch', () => {
  draw({ id: 'a1', title: 'Reverse', enabled: false, created: true })

  expect(screen.getByTestId('author-wrote').textContent).toBe(
    'ReverseWritten — off until you turn it onOpen',
  )
  // Absolute, because the card is drawn from under /chat and the switch is not.
  expect(screen.getByTestId('author-open').getAttribute('href')).toBe('/extensions/a1')
})

test('one that was already on says so rather than telling you to turn it on', () => {
  draw({ id: 'a1', title: 'Reverse', enabled: true, created: false })
  expect(screen.getByTestId('author-wrote').textContent).toBe(
    'ReverseUpdated — runningOpen',
  )
})

test('output that is not a write says so rather than throwing', () => {
  // What a `View` is handed came back through storage, so it is only ever
  // `unknown`, and the drawing is what has to survive that.
  draw({ id: 12 })
  expect(screen.getByTestId('author-wrote').textContent).toBe('Nothing was written.')
})
