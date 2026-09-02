import { Button } from '@tiny/ui/components/button'
import { Textarea } from '@tiny/ui/components/textarea'
import type { ChatStatus } from 'ai'
import { ArrowUpIcon, Loader2Icon, SquareIcon } from 'lucide-react'
import { useState, type KeyboardEvent, type ReactElement } from 'react'

const ICON: Readonly<Record<ChatStatus, ReactElement>> = {
  submitted: <Loader2Icon className="animate-spin" />,
  streaming: <SquareIcon />,
  ready: <ArrowUpIcon />,
  error: <ArrowUpIcon />,
}

/** The prompt bar: what you're typing, what will answer, and one button. */
export function Composer({
  draftKey,
  model,
  status,
  onSend,
  onStop,
}: {
  draftKey: string
  model: string
  status: ChatStatus
  onSend: (text: string) => void
  onStop: () => void
}) {
  // Read once. Switching conversation remounts the composer, so the draft it
  // starts with is always the one belonging to the conversation on screen.
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? '')
  const busy = status === 'submitted' || status === 'streaming'

  // Half a message is worth keeping. Reloading mid-sentence shouldn't cost it.
  const write = (next: string) => {
    setText(next)
    if (next) localStorage.setItem(draftKey, next)
    else localStorage.removeItem(draftKey)
  }

  const send = () => {
    if (busy || text.trim().length === 0) return
    onSend(text)
    write('')
  }

  // Enter sends and shift-Enter breaks the line, but not mid-IME, where Enter
  // is how you accept the candidate you're looking at.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    send()
  }

  return (
    <form
      // A raised window, not a bordered box: the hairline comes with the
      // elevation, and the field inside gives up its own chrome to sit in it.
      className="bg-surface shadow-card rounded-window focus-within:ring-brand/40 flex flex-col transition-shadow focus-within:ring-2"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <Textarea
        data-testid="chat-input"
        className="max-h-48 resize-none rounded-none border-0 bg-transparent px-3.5 pt-3 pb-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
        placeholder="Ask anything"
        value={text}
        onChange={(event) => write(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <span
          data-testid="chat-model"
          className="text-ink-2 bg-inset rounded-chip min-w-0 truncate px-2 py-1 text-xs"
        >
          {model}
        </span>
        <Button
          data-testid="chat-send"
          type={busy ? 'button' : 'submit'}
          size="icon"
          className="rounded-control size-10 shrink-0"
          aria-label={busy ? 'Stop' : 'Send'}
          disabled={!busy && text.trim().length === 0}
          onClick={busy ? onStop : undefined}
        >
          {ICON[status]}
        </Button>
      </div>
    </form>
  )
}
