import { render, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { createElement } from 'react'
import type { PrismEditor } from 'prism-code-editor'
import { RichEditor } from './editor'

/**
 * The wiring, not the table — `complete.test.ts` says what should be offered
 * where. This says the editor asks us at all, and shows what comes back.
 */
const open = (value: string) =>
  new Promise<PrismEditor>((ready) => {
    render(createElement(RichEditor, { value, onChange: () => {}, onReady: ready }))
  })

/** What the list would say, asked the way Ctrl+Space asks. */
const offered = async (editor: PrismEditor, at: number) => {
  editor.textarea.focus()
  editor.textarea.setSelectionRange(at, at)
  ;(
    editor.extensions.autoComplete as { startQuery(explicit?: boolean): void }
  ).startQuery(true)
  await waitFor(() => expect(document.querySelector('.pce-ac-row')).not.toBeNull())
  // prism pads the list with blank rows; only the filled ones are options.
  return [...document.querySelectorAll('.pce-ac-label')]
    .map((row) => row.textContent?.trim() ?? '')
    .filter(Boolean)
}

test('it is a real textarea, so the platform keeps the caret and the handles', async () => {
  const editor = await open('const a = 1')

  expect(editor.textarea.tagName).toBe('TEXTAREA')
  // What iOS would otherwise do to your identifiers and your quotes.
  expect(editor.textarea.getAttribute('autocapitalize')).toBe('off')
  expect(editor.textarea.getAttribute('autocorrect')).toBe('off')
  expect(editor.textarea.getAttribute('spellcheck')).toBe('false')
})

test('it highlights, rather than painting everything one colour', async () => {
  await open("import { tool } from 'ai'")

  await waitFor(() =>
    expect(document.querySelectorAll('.token').length).toBeGreaterThan(3),
  )
  const kinds = [...document.querySelectorAll('.token')].map((one) => one.className)
  expect(kinds.some((one) => one.includes('keyword'))).toBe(true)
  expect(kinds.some((one) => one.includes('string'))).toBe(true)
})

test('after a dot on the host, it offers what the host actually has', async () => {
  const editor = await open('tiny.')

  expect((await offered(editor, 5)).sort()).toEqual([
    'ask',
    'useActions',
    'useChats',
    'useInstructions',
    'useModel',
    'useProviders',
    'useTools',
  ])
})

test('inside an import it offers only what the page can resolve', async () => {
  const source = "import { z } from ''"
  const editor = await open(source)

  expect((await offered(editor, source.length - 1)).sort()).toEqual([
    'ai',
    'react',
    'react-router',
    'react/jsx-runtime',
    'zod',
  ])
})

test('a path it knows nothing about is left alone', async () => {
  const editor = await open('const r = {}\nr.thing.')

  editor.textarea.focus()
  editor.textarea.setSelectionRange(21, 21)
  ;(
    editor.extensions.autoComplete as { startQuery(explicit?: boolean): void }
  ).startQuery(true)
  await new Promise((settle) => setTimeout(settle, 100))

  // Offering the document's other words here is how an editor suggests code
  // that does not exist.
  expect(document.querySelector('.pce-ac-row')).toBeNull()
})
