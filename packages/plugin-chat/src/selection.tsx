import { useEffect, useState } from 'react'

/** What you can ask for once you've highlighted something. */
const ACTIONS = [
  { label: 'Explain', ask: 'Explain this' },
  { label: 'Improve', ask: 'Improve this' },
  { label: 'Shorten', ask: 'Shorten this' },
  { label: 'Tone', ask: 'Rewrite this in a warmer tone' },
  { label: 'Grammar', ask: 'Fix the grammar in this' },
] as const

type Passage = { readonly text: string; readonly top: number }

const elementOf = (node: Node | null | undefined): Element | null =>
  node instanceof Element ? node : (node?.parentElement ?? null)

/**
 * Highlight a passage in a reply and hand it to the model. Only replies:
 * selecting your own words is copying, not asking for another go at them.
 */
export function SelectionActions({ onPick }: { onPick: (prompt: string) => void }) {
  const [passage, setPassage] = useState<Passage | null>(null)

  useEffect(() => {
    const read = () => {
      const selection = document.getSelection()
      const text = selection?.toString().trim() ?? ''
      const inReply = elementOf(selection?.anchorNode)?.closest(
        '[data-testid="message-assistant"]',
      )
      if (!selection || !inReply || text.length === 0) return setPassage(null)

      setPassage({ text, top: selection.getRangeAt(0).getBoundingClientRect().top })
    }

    document.addEventListener('selectionchange', read)
    return () => document.removeEventListener('selectionchange', read)
  }, [])

  if (!passage) return null

  const take = (ask: string) => {
    onPick(`${ask}:\n\n> ${passage.text}`)
    document.getSelection()?.removeAllRanges()
    setPassage(null)
  }

  return (
    <div
      // Fixed and centred on the viewport: the transcript scrolls under it, the
      // rect is viewport-relative, and five actions near an edge would hang off.
      className="shadow-overlay bg-surface fixed inset-x-3 z-50 mx-auto flex h-9 w-fit max-w-[calc(100vw-1.5rem)] -translate-y-full items-center gap-0.5 overflow-x-auto rounded-full p-1"
      style={{ top: passage.top - 8 }}
    >
      {ACTIONS.map(({ label, ask }) => (
        <button
          key={label}
          type="button"
          data-testid={`selection-${label.toLowerCase()}`}
          className="text-ink hover:bg-hover h-7 shrink-0 rounded-full px-2.5 text-xs transition-colors"
          onClick={() => take(ask)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
