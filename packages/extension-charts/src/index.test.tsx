import { render, screen } from '@testing-library/react'
import { expect, test } from 'bun:test'
import type { ComponentType } from 'react'
import charts from './index'

const chart = charts().tools?.chart
const View = chart?.View as ComponentType<{ input: unknown; output: unknown }>

const draw = (output: unknown) => render(<View input={{}} output={output} />)

test('bars are drawn in proportion to the biggest one', () => {
  draw({
    rows: [
      { label: 'Mon', value: 5 },
      { label: 'Tue', value: 10 },
    ],
  })

  expect(screen.getByTestId('chart-bar-Mon').style.width).toBe('50%')
  expect(screen.getByTestId('chart-bar-Tue').style.width).toBe('100%')
})

test('all-zero is a row of empty bars, not a divide by nothing', () => {
  draw({ rows: [{ label: 'Mon', value: 0 }] })
  expect(screen.getByTestId('chart-bar-Mon').style.width).toBe('0%')
})

test('output that is not a chart says so rather than throwing', () => {
  // What a `View` is handed came back through storage, so it is only ever
  // `unknown` — and the drawing, not chat, is what has to survive that.
  draw({ rows: 'yesterday' })
  expect(screen.getByTestId('chart').textContent).toBe('Not a chart.')
})

test('the title is drawn when there is one, and nothing stands in when there is not', () => {
  draw({ title: 'Sales', rows: [{ label: 'Mon', value: 1 }] })
  expect(screen.getByTestId('chart').textContent).toContain('Sales')

  draw({ rows: [{ label: 'Mon', value: 1 }] })
  expect(screen.getAllByTestId('chart')[1]?.textContent).toBe('Mon1')
})

test('the numbers are not handed back to the model that just sent them', async () => {
  const rows = [{ label: 'Mon', value: 5 }]
  // What `execute` returns is for the drawing; what the model is told is this.
  expect(
    await chart?.toModelOutput?.({ toolCallId: 'c1', input: { rows }, output: { rows } }),
  ).toEqual({
    type: 'text',
    value: 'Drawn.',
  })
})
