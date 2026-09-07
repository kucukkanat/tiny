import { render, screen } from '@testing-library/react'
import { expect, test } from 'bun:test'
import type { Viewed } from '@tiny/host'
import extension from './index'
import type { Result } from './fetch'

const view = () => {
  const { View } = (extension().tools ?? {}).fetch as Viewed
  if (!View) throw new Error('the fetch tool lost its View')
  return View
}

const ok: Result = {
  url: 'https://x.test/a',
  status: 200,
  ok: true,
  contentType: 'application/json',
  headers: {},
  kind: 'json',
  body: '{"a":1}',
  bytes: 7,
  truncated: false,
  ms: 12,
}

test('a response shows what was asked, what came back, and the body', () => {
  const View = view()
  render(<View input={{ url: ok.url, method: 'GET' }} output={ok} />)

  expect(screen.getByTestId('fetch-status').textContent).toBe('GET 200')
  expect(screen.getByTestId('fetch-url').textContent).toBe('https://x.test/a')
  expect(screen.getByTestId('fetch-body').textContent).toBe('{"a":1}')
})

test('a failed status is drawn as one', () => {
  const View = view()
  render(
    <View
      input={{ url: ok.url, method: 'DELETE' }}
      output={{ ...ok, status: 404, ok: false }}
    />,
  )

  expect(screen.getByTestId('fetch-status').textContent).toBe('DELETE 404')
  expect(screen.getByTestId('fetch-status').className).toContain('text-red')
})

test('a drawing handed something that is not a response says so instead of throwing', () => {
  const View = view()
  render(<View input={{ nope: true }} output={null} />)

  expect(screen.getByTestId('fetch-result').textContent).toBe('Not a response.')
})

test('the model is told the tool cannot reach a host that blocks it', () => {
  expect(extension().instructions).toContain('Access-Control-Allow-Origin')
})
