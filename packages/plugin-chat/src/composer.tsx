import { Button } from '@tiny/ui/components/button'
import { Textarea } from '@tiny/ui/components/textarea'
import type { ChatStatus } from 'ai'
import { CornerDownLeftIcon, Loader2Icon, SquareIcon } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

const busyStatuses = ['submitted', 'streaming'] as const satisfies readonly ChatStatus[]

/** The message box: a textarea, and one button that sends or stops. */
export function Composer({
  placeholder,
  status,
  onSend,
  onStop,
}: {
  placeholder: string
  status: ChatStatus
  onSend: (text: string) => void
  onStop: () => void
}) {
  const [text, setText] = useState('')
  const busy = busyStatuses.some((busyStatus) => busyStatus === status)

  const send = () => {
    if (busy || text.trim().length === 0) return
    onSend(text)
    setText('')
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
        onChange={(event) => setText(event.target.value)}
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
          {status === 'submitted' ? (
            <Loader2Icon className="animate-spin" />
          ) : status === 'streaming' ? (
            <SquareIcon />
          ) : (
            <CornerDownLeftIcon />
          )}
        </Button>
      </div>
    </form>
  )
}
