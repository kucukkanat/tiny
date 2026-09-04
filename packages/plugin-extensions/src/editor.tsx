import { createEditor, type PrismEditor } from 'prism-code-editor'
import {
  autoComplete,
  fuzzyFilter,
  registerCompletions,
  type CompletionSource,
} from 'prism-code-editor/autocomplete'
import {
  completeIdentifiers,
  completeKeywords,
  jsContext,
  type JSContext,
} from 'prism-code-editor/autocomplete/javascript'
import { defaultCommands, editHistory } from 'prism-code-editor/commands'
import { cursorPosition } from 'prism-code-editor/cursor'
import { matchBrackets } from 'prism-code-editor/match-brackets'
import 'prism-code-editor/prism/languages/javascript'
import { useEffect, useRef, useState } from 'react'
import { completionsFor } from './complete'
import './editor.css'
import type { RichEditorProps } from './rich'

// What we know, before what the editor can only guess at. Registered once for
// the language, not per editor.
/**
 * One source, not three. prism merges whatever every source returns, so a
 * second one that answers `tiny.` with the document's other words would put
 * them in the same list — and a suggestion that doesn't exist is worse than no
 * suggestion. Everything the list may contain is decided here.
 */
registerCompletions(['javascript'], {
  context: jsContext,
  sources: [
    ((context, editor) => {
      const { path, lineBefore, pos } = context
      const found = completionsFor(path, lineBefore)
      if (!found) return null

      // At the top level a bare word could be anything, so the language's own
      // keywords and whatever else is written in this file are worth having.
      const language =
        path?.length === 1
          ? [
              ...(completeKeywords(context, editor)?.options ?? []),
              ...(completeIdentifiers()(context, editor)?.options ?? []),
            ]
          : []

      return {
        from: pos - found.word.length,
        options: [...found.options, ...language],
      }
    }) satisfies CompletionSource<JSContext>,
  ],
})

/** What a phone's keyboard hasn't got, in the order you reach for it. */
const KEYS = ['\t', '{', '}', '(', ')', '[', ']', "'", '.', ':', ',', '=>'] as const

export function RichEditor({ value, onChange, onReady }: RichEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<PrismEditor>(null)
  const [keyboard, setKeyboard] = useState(false)

  useEffect(() => {
    if (!host.current) return
    const made = createEditor(
      host.current,
      { language: 'javascript', value, tabSize: 2, lineNumbers: true },
      defaultCommands(),
      editHistory(),
      cursorPosition(),
      matchBrackets(),
      autoComplete({
        // Right after a dot there is nothing typed yet to match against, and
        // that is exactly when the list is worth most.
        filter: (query, option) => (query ? fuzzyFilter(query, option) : [0, []]),
      }),
    )
    editor.current = made

    // prism sets all of these but `autocorrect`, which is the one that turns
    // your quotes curly and your identifiers into sentences on iOS.
    made.textarea.setAttribute('autocorrect', 'off')
    made.textarea.setAttribute('data-testid', 'ext-source')

    made.on('update', (next: string) => onChange(next))
    onReady?.(made)
    return () => made.remove()
    // Built once. `value` after that is the editor's own business, or every
    // keystroke would tear it down and rebuild it.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The keyboard is the only thing that knows it is up: the layout viewport and
  // `dvh` keep their full height underneath it, so the bar has to be told.
  useEffect(() => {
    const view = window.visualViewport
    if (!view) return
    const look = () => setKeyboard(view.height < window.innerHeight - 120)
    look()
    view.addEventListener('resize', look)
    return () => view.removeEventListener('resize', look)
  }, [])

  /** Insert at the caret without taking focus, so the keyboard stays up. */
  const press = (key: string) => {
    const box = editor.current?.textarea
    if (!box) return
    const { selectionStart: from, selectionEnd: to } = box
    box.setRangeText(key, from, to, 'end')
    box.dispatchEvent(new Event('input', { bubbles: true }))
  }

  return (
    <>
      <div
        ref={host}
        data-testid="ext-editor"
        // Code scrolls sideways rather than wrapping, so the box has to hold it in.
        className="border-input min-w-0 overflow-hidden rounded-lg border [&_.prism-code-editor]:max-h-[60svh] [&_.prism-code-editor]:min-h-48"
      />
      {keyboard && (
        <div
          data-testid="ext-keys"
          className="border-line bg-surface fixed inset-x-0 bottom-0 z-50 flex gap-1 overflow-x-auto border-t p-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
          // Keeping focus is the whole point: losing it drops the keyboard.
          onPointerDown={(event) => event.preventDefault()}
        >
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              data-testid={`ext-key-${key === '\t' ? 'tab' : key}`}
              className="text-ink bg-inset rounded-control size-11 shrink-0 font-mono text-sm"
              onClick={() => press(key)}
            >
              {key === '\t' ? '⇥' : key}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
