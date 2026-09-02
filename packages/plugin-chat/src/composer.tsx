import { Button } from '@tiny/ui/components/button'
import { Textarea } from '@tiny/ui/components/textarea'
import type { ChatStatus } from 'ai'
import { CornerDownLeftIcon, Loader2Icon, SquareIcon } from 'lucide-react'
import { useState, type KeyboardEvent, type ReactElement } from 'react'

const ICON: Readonly<Record<ChatStatus, ReactElement>> = {
  submitted: <Loader2Icon className="animate-spin" />,
  streaming: <SquareIcon />,
  ready: <CornerDownLeftIcon />,
  error: <CornerDownLeftIcon />,
}

/** The message box: a textarea, and one button that sends or stops. */
export function Composer({
  draftKey,
  placeholder,
  status,
  onSend,
  onStop,
}: {
  draftKey: string
  placeholder: string
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
      // The border lives on the wrapper so the textarea and the button read as
      // one control, which is why the textarea gives its own up.
      className="border-input focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 flex flex-col rounded-lg border transition-colors focus-within:ring-3"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <Textarea
        data-testid="chat-input"
        className="max-h-48 resize-none rounded-none border-0 bg-transparent focus-visible:ring-0 dark:bg-transparent"
        placeholder={placeholder}
        value={text}
        onChange={(event) => write(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="flex justify-end p-2">
        <Button
          data-testid="chat-send"
          type={busy ? 'button' : 'submit'}
          size="icon"
          className="size-10"
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
