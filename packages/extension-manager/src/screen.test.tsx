import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { MemoryRouter, Route, Routes } from 'react-router'
import { useInstalled } from './installed'
import { attach } from './loaded'
import { ExtensionsScreen } from './screen'
import { TEMPLATES } from './templates'

attach(
  {
    useChats: () => [],
    useModel: () => undefined,
    ask: () => Promise.resolve(''),
    useTools: () => ({}),
    useInstructions: () => undefined,
    useActions: () => [],
    useProviders: () => ({}),
  },
  [
    () => ({ id: 'chat', title: 'Chat', Screen: () => null }),
    () => ({ id: 'settings', title: 'Settings', Screen: () => null }),
    () => ({ id: 'extensions', title: 'Extensions', Screen: ExtensionsScreen }),
  ],
)

// The shell mounts it at `/extensions/*` and its own routes below that.
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

// It holds its own switch, so it cannot live inside the has-anything branch:
// hiding Chat with nothing installed would leave no way to bring it back.
test('what ships is listed whether or not anything is installed', () => {
  renderExtensions()

  expect(screen.getByTestId('ext-built')).toBeDefined()
  expect(screen.getByTestId('ext-built-chat')).toBeDefined()
  // The screen the switches are on is the one thing that cannot be hidden.
  expect(screen.getByTestId('ext-built-locked')).toBeDefined()
  expect(screen.queryByTestId('ext-built-extensions')).toBeNull()
})

test('hiding one that ships takes it out of the fold, and it can come back', () => {
  renderExtensions()

  fireEvent.click(screen.getByTestId('ext-built-chat'))
  expect(screen.getByTestId('ext-built-status-chat').textContent).toBe('Hidden')

  fireEvent.click(screen.getByTestId('ext-built-chat'))
  expect(screen.getByTestId('ext-built-status-chat').textContent).not.toBe('Hidden')
})

test('with nothing installed, it says what an extension is and offers one', () => {
  renderExtensions()

  expect(document.body.textContent).toContain("somebody else's code")
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

test('a blank one opens empty, and what you paste in names it', () => {
  const list = renderExtensions()
  fireEvent.click(screen.getByTestId('ext-blank'))

  const id = stored()[0]?.id ?? ''
  expect(stored()[0]?.title).toBe('Pasted')
  expect(stored()[0]?.source).toBe('')
  list.unmount()

  renderExtensions(`/extensions/${id}`)
  type('ext-source', `export default () => ({ id: 'dice', title: 'Dice' })`)
  expect(stored()[0]?.title).toBe('Dice')

  // Text that names nothing leaves the name it already had, which is what
  // keeps a file called `mine.js` called that while you edit it.
  type('ext-source', '// starting over')
  expect(stored()[0]?.title).toBe('Dice')
})

test('typing after you turn one on does not turn it off again', async () => {
  const list = renderExtensions()
  fireEvent.click(screen.getByTestId('ext-blank'))
  const id = stored()[0]?.id ?? ''
  list.unmount()

  // The real editor, not the plain box. It is built once, so what it calls on
  // every keystroke used to be the props of the render that built it — and a
  // save from before the switch wrote the whole row back off.
  const view = renderExtensions(`/extensions/${id}`)
  await waitFor(() => expect(screen.queryByTestId('ext-editor')).not.toBeNull())

  act(() => void fireEvent.click(screen.getByTestId(`ext-enabled-${id}`)))
  await act(async () => {
    type('ext-source', `export default () => ({ id: 'kept', title: 'Kept' })`)
  })

  expect(stored()[0]?.enabled).toBe(true)
  expect(stored()[0]?.source).toContain('Kept')
  view.unmount()
})

test('what you paste into a blank one is what runs when you turn it on', async () => {
  const list = renderExtensions()
  fireEvent.click(screen.getByTestId('ext-blank'))
  const id = stored()[0]?.id ?? ''
  list.unmount()

  // Turning it on is the first time this text is compiled. A blob minted while
  // it was still off would have been made from the empty box, and only Run
  // bumps the version that would mint another.
  const view = renderExtensions(`/extensions/${id}`)
  type('ext-source', `export default () => ({ id: 'pasted', title: 'Pasted One' })`)
  act(() => void fireEvent.click(screen.getByTestId(`ext-enabled-${id}`)))
  await waitFor(() => expect(screen.queryByTestId('ext-registers')).not.toBeNull())

  expect(screen.queryByTestId(`ext-error-${id}`)).toBeNull()
  expect(stored()[0]?.title).toBe('Pasted One')
  view.unmount()
})

test('an edit made while it loads is not undone by the name it turns out to have', async () => {
  // The first `title:` in the text is not the extension's own, so the row is
  // named wrong until it runs — which is what makes the loader rename it, and
  // renaming is where an in-flight edit used to be written back over.
  const source = `const parts = { title: 'Draft' }
export default () => ({ id: 'plain', title: 'Real' })`
  const list = renderExtensions()
  fireEvent.change(screen.getByTestId('ext-file'), {
    target: { files: [new File([source], 'plain.js', { type: 'text/javascript' })] },
  })
  await waitFor(() => expect(stored()).toHaveLength(1))
  const id = stored()[0]?.id ?? ''
  list.unmount()

  const view = renderExtensions(`/extensions/${id}`)
  act(() => void fireEvent.click(screen.getByTestId(`ext-enabled-${id}`)))
  type('ext-source', `${source}\n// typed while it was loading`)
  await waitFor(() => expect(screen.queryByTestId('ext-registers')).not.toBeNull())

  expect(stored()[0]?.source).toContain('typed while it was loading')
  expect(stored()[0]?.title).toBe('Real')
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

/** One in storage and nothing mounted, so a test can start wherever it means to. */
const install = () => {
  const view = renderExtensions()
  fireEvent.click(screen.getByTestId('ext-template-weather'))
  const id = stored()[0]?.id ?? ''
  view.unmount()
  return id
}

test('deleting one takes it out of the list and out of storage', async () => {
  const id = install()
  renderExtensions()

  fireEvent.click(screen.getByTestId(`ext-delete-${id}`))
  fireEvent.click(await screen.findByTestId('confirm-delete'))

  expect(stored()).toEqual([])
})

test('the delete asks first, and backing out keeps it', async () => {
  const id = install()
  renderExtensions()

  fireEvent.click(screen.getByTestId(`ext-delete-${id}`))
  // What it says goes is what you would miss: the only copy of the source.
  expect((await screen.findByTestId('confirm')).textContent).toContain('another copy')

  fireEvent.click(screen.getByTestId('confirm-cancel'))

  expect(stored()).toHaveLength(1)
  expect(screen.getByTestId(`ext-open-${id}`)).toBeDefined()
})

test('a linked one is told what it would take to get it back', async () => {
  renderExtensions()
  type('ext-url', 'https://cdn.jsdelivr.net/gh/me/ext@v1/x.js')
  fireEvent.click(screen.getByTestId('ext-add'))

  fireEvent.click(screen.getByTestId(`ext-delete-${stored()[0]?.id ?? ''}`))

  expect((await screen.findByTestId('confirm')).textContent).toContain('its URL again')
})

test('deleting from its own page asks, then puts you back on the list', async () => {
  const id = install()
  renderExtensions(`/extensions/${id}`)

  fireEvent.click(screen.getByTestId(`ext-delete-${id}`))
  fireEvent.click(await screen.findByTestId('confirm-delete'))

  expect(stored()).toEqual([])
  expect(screen.getByTestId('ext-url')).toBeDefined()
})
