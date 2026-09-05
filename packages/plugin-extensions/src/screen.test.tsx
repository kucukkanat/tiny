import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { MemoryRouter, Route, Routes } from 'react-router'
import { useInstalled } from './installed'
import { attach } from './loaded'
import { ExtensionsScreen } from './screen'
import { TEMPLATES } from './templates'

attach(
  { useChats: () => [], useModel: () => undefined, ask: () => Promise.resolve('') },
  ['chat', 'settings', 'extensions'],
)

// The shell mounts the plugin at `/extensions/*` and the plugin routes below it.
const renderExtensions = (at = '/extensions') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/extensions/*" element={<ExtensionsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

// `input`, not `change`: it is what typing actually fires, and what both React
// and the editor listen for.
const type = (testid: string, value: string) =>
  fireEvent.input(screen.getByTestId(testid), { target: { value } })

/** Reading the store the way the screen does, so its cache is dropped after. */
const stored = () => {
  const { renderHook } = require('@testing-library/react') as {
    renderHook: (h: () => unknown) => { result: { current: unknown } }
  }
  return renderHook(useInstalled).result.current as ReturnType<typeof useInstalled>
}

test('with nothing installed, it says what an extension is and offers one', () => {
  renderExtensions()

  expect(document.body.textContent).toContain('a feature someone else wrote')
  expect(screen.getByTestId('ext-example')).toBeDefined()
})

test('an address that will not work is turned down before it is saved', () => {
  renderExtensions()
  type('ext-url', 'https://cdn.jsdelivr.net/gh/me/ext@main/x.js')

  expect(screen.getByTestId('ext-url-hint').textContent).toContain('Pin a tag')
  expect(screen.getByTestId('ext-add').hasAttribute('disabled')).toBe(true)
})

test('an address that will work can be added', () => {
  renderExtensions()
  type('ext-url', 'https://cdn.jsdelivr.net/gh/me/ext@v1/x.js')
  fireEvent.click(screen.getByTestId('ext-add'))

  expect(stored().map(({ url }) => url)).toEqual([
    'https://cdn.jsdelivr.net/gh/me/ext@v1/x.js',
  ])
})

test.each(TEMPLATES.map(({ label, title }) => [label, title] as const))(
  'the %s premade opens as something you can edit',
  (label, title) => {
    renderExtensions()
    fireEvent.click(
      screen.getByTestId(`ext-template-${label.toLowerCase().replace(' ', '-')}`),
    )

    const [one] = stored()
    expect(one?.title).toBe(title)
    // Its text is what was stored, not an address to fetch it from.
    expect(one?.source).toContain('export default')
    expect(one?.url).toBeUndefined()
    expect(one?.enabled).toBe(false)
  },
)

test('a file you pick is read, and named after itself', async () => {
  renderExtensions()
  const file = new File([`export default () => ({ id: 'x', title: 'X' })`], 'mine.js', {
    type: 'text/javascript',
  })
  fireEvent.change(screen.getByTestId('ext-file'), { target: { files: [file] } })

  await waitFor(() => expect(stored()).toHaveLength(1))
  expect(stored()[0]?.title).toBe('mine.js')
  expect(stored()[0]?.source).toContain('export default')
})

test('what you type is saved as you type, so a reload costs nothing', () => {
  const list = renderExtensions()
  fireEvent.click(screen.getByTestId('ext-template-weather'))
  const id = stored()[0]?.id ?? ''
  list.unmount()

  renderExtensions(`/extensions/${id}`)
  type('ext-source', 'export default () => ({ id: "edited", title: "Edited" })')

  expect(stored()[0]?.source).toContain('id: "edited"')
})

test('prettify lays out what is in the box, and saves it', async () => {
  const list = renderExtensions()
  fireEvent.click(screen.getByTestId('ext-template-weather'))
  const id = stored()[0]?.id ?? ''
  list.unmount()

  renderExtensions(`/extensions/${id}`)
  type('ext-source', 'const a={x:1};export default ()=>a')
  await act(async () => void fireEvent.click(screen.getByTestId('ext-prettify')))

  expect(stored()[0]?.source).toBe('const a = { x: 1 }\nexport default () => a\n')
})

test('prettify says what is wrong rather than eating the source', async () => {
  const list = renderExtensions()
  fireEvent.click(screen.getByTestId('ext-template-weather'))
  const id = stored()[0]?.id ?? ''
  list.unmount()

  renderExtensions(`/extensions/${id}`)
  type('ext-source', 'const = ')
  await act(async () => void fireEvent.click(screen.getByTestId('ext-prettify')))

  expect(screen.getByTestId('ext-source-hint').textContent).toContain('Unexpected token')
  expect(stored()[0]?.source).toBe('const = ')
})

test('an edit does not run until you say so, and says as much', async () => {
  // No bare imports: those resolve through the page's import map, which Bun has
  // no equivalent of, so a template would never finish loading here.
  const source = `export default () => ({ id: 'plain', title: 'Plain' })`
  const list = renderExtensions()
  fireEvent.change(screen.getByTestId('ext-file'), {
    target: { files: [new File([source], 'plain.js', { type: 'text/javascript' })] },
  })
  await waitFor(() => expect(stored()).toHaveLength(1))
  const id = stored()[0]?.id ?? ''
  list.unmount()

  // On, and loaded, so there is something running for an edit to be ahead of.
  const view = renderExtensions(`/extensions/${id}`)
  act(() => void fireEvent.click(screen.getByTestId(`ext-enabled-${id}`)))
  await waitFor(() => expect(screen.queryByTestId('ext-registers')).not.toBeNull())

  type('ext-source', `${source}\n// a change`)
  expect(screen.getByTestId('ext-source-hint').textContent).toContain('Press Run')

  const before = stored()[0]?.version ?? 0
  fireEvent.click(screen.getByTestId(`ext-reload-${id}`))
  expect(stored()[0]?.version).toBe(before + 1)
  view.unmount()
})

test('a link to one that is gone lands back on the list', () => {
  renderExtensions('/extensions/nope')
  expect(screen.getByTestId('ext-url')).toBeDefined()
})

test('an install link lands switched off, whatever it claims', () => {
  renderExtensions(
    '/extensions/install?url=' +
      encodeURIComponent('https://cdn.jsdelivr.net/gh/me/ext@v1/x.js'),
  )
  expect(screen.getByTestId('ext-warning')).toBeDefined()

  fireEvent.click(screen.getByTestId('ext-install-confirm'))
  expect(stored()[0]?.enabled).toBe(false)
})

test('an install link nobody should follow is refused, with no way to confirm', () => {
  renderExtensions(
    '/extensions/install?url=' +
      encodeURIComponent('https://raw.githubusercontent.com/me/ext/main/x.js'),
  )

  expect(screen.getByTestId('ext-url-hint').textContent).toContain('plain text')
  expect(screen.getByTestId('ext-install-confirm').hasAttribute('disabled')).toBe(true)
})

test('deleting one takes it out of the list and out of storage', () => {
  const first = renderExtensions()
  fireEvent.click(screen.getByTestId('ext-template-weather'))
  const id = stored()[0]?.id ?? ''
  first.unmount()

  renderExtensions()
  fireEvent.click(screen.getByTestId(`ext-delete-${id}`))

  expect(stored()).toEqual([])
})
