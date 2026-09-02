import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ToolsScreen } from './screen'
import { TEMPLATES } from './templates'

// The shell mounts the plugin at `/tools/*` and the plugin routes below that.
const renderTools = (at = '/tools') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/tools/*" element={<ToolsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

const OK = `tool({ description: 'Says ok.', execute: () => 'ok' })`

const seed = (id: string, name: string, source = OK) =>
  localStorage.setItem(
    `tiny.tool.${id}`,
    JSON.stringify({ id, name, source, enabled: true }),
  )

const type = (testid: string, value: string) =>
  fireEvent.change(screen.getByTestId(testid), { target: { value } })

test('with nothing written yet, it says what a tool is for', () => {
  renderTools()
  expect(document.body.textContent).toContain('the model can call')
})

test('a new tool opens with something already in the box', () => {
  renderTools()
  fireEvent.click(screen.getByTestId('tool-new'))

  expect(screen.getByTestId<HTMLTextAreaElement>('tool-source').value).toBe(
    TEMPLATES[0].source,
  )
})

test('a name a provider would refuse is called out', () => {
  seed('1', 'weather')
  renderTools('/tools/1')

  type('tool-name', 'get weather')
  expect(screen.getByTestId('tool-name-hint').textContent).toContain('Letters, digits')
})

test('two tools cannot answer to the same name', () => {
  seed('1', 'weather')
  seed('2', 'clock')
  renderTools('/tools/2')

  type('tool-name', 'weather')
  expect(screen.getByTestId('tool-name-hint').textContent).toContain('already answers')
})

test('what the box compiles to is said underneath it', () => {
  seed('1', 'weather')
  renderTools('/tools/1')

  type(
    'tool-source',
    `tool({ inputSchema: z.object({ city: z.string() }), execute: () => 1 })`,
  )
  expect(screen.getByTestId('tool-source-hint').textContent).toBe(
    'Compiles. Takes city (required).',
  )
})

test('source that will not compile says why, and the tool is still yours to fix', () => {
  seed('1', 'weather')
  renderTools('/tools/1')

  type('tool-source', 'tool({ oops')
  expect(screen.getByTestId('tool-source').getAttribute('aria-invalid')).toBe('true')
  expect(screen.getByTestId('tool-source-hint').textContent).not.toBe('')
})

test('a template replaces what is in the box', () => {
  seed('1', 'weather')
  renderTools('/tools/1')

  fireEvent.click(screen.getByTestId('tool-template-ask'))
  expect(screen.getByTestId<HTMLTextAreaElement>('tool-source').value).toContain('ask(')
})

test('what you write survives a reload', () => {
  seed('1', 'weather')
  const { unmount } = renderTools('/tools/1')
  type('tool-name', 'forecast')
  unmount()

  renderTools('/tools/1')
  expect(screen.getByTestId<HTMLInputElement>('tool-name').value).toBe('forecast')
})

test('the switch turns a tool off without losing it', () => {
  seed('1', 'weather')
  const { unmount } = renderTools()
  fireEvent.click(screen.getByTestId('tool-enabled-1'))
  unmount()

  renderTools()
  expect(screen.getByTestId('tool-enabled-1').getAttribute('data-state')).toBe(
    'unchecked',
  )
})

test('deleting a tool takes it off the list', () => {
  seed('1', 'weather')
  renderTools()
  fireEvent.click(screen.getByTestId('tool-delete-1'))

  expect(screen.queryByTestId('tool-open-1')).toBeNull()
  expect(localStorage.getItem('tiny.tool.1')).toBeNull()
})

test('a link to a tool that is gone lands back on the list', () => {
  renderTools('/tools/nope')
  expect(screen.getByTestId('tool-new')).toBeDefined()
})
