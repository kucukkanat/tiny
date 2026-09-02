import { Button } from '@tiny/ui/components/button'
import { QuoteIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

type Passage = { readonly text: string; readonly top: number; readonly left: number }

const elementOf = (node: Node | null | undefined): Element | null =>
  node instanceof Element ? node : (node?.parentElement ?? null)

/**
 * Highlight a passage in a reply and hand it back to the model. Only replies:
 * selecting your own words is copying, not asking for another go at them.
 */
export function SelectionActions({ onPick }: { onPick: (passage: string) => void }) {
  const [passage, setPassage] = useState<Passage | null>(null)

  useEffect(() => {
    const read = () => {
      const selection = document.getSelection()
      const text = selection?.toString().trim() ?? ''
      const inReply = elementOf(selection?.anchorNode)?.closest(
        '[data-testid="message-assistant"]',
      )
      if (!selection || !inReply || text.length === 0) return setPassage(null)

      const { top, left, width } = selection.getRangeAt(0).getBoundingClientRect()
      setPassage({ text, top, left: left + width / 2 })
    }

    document.addEventListener('selectionchange', read)
    return () => document.removeEventListener('selectionchange', read)
  }, [])

  if (!passage) return null

  return (
    <Button
      data-testid="selection-ask"
      size="sm"
      // Fixed, because the transcript scrolls under it and the rect is viewport-relative.
      className="shadow-overlay rounded-control fixed z-50 -translate-x-1/2 -translate-y-full gap-1.5"
      style={{ top: passage.top - 8, left: passage.left }}
      onClick={() => {
        onPick(passage.text)
        document.getSelection()?.removeAllRanges()
        setPassage(null)
      }}
    >
      <QuoteIcon />
      Rewrite this
    </Button>
  )
}
