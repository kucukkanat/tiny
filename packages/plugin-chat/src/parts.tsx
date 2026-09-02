import {
  MessageAction,
  MessageActions,
  MessageResponse,
} from '@tiny/ui/components/ai-elements/message'
import { CodeBlock } from '@tiny/ui/components/code-block'
import { Loading, Shimmer } from '@tiny/ui/components/loading'
import { useCopy } from '@tiny/ui/hooks/use-copy'
import type { DynamicToolUIPart } from 'ai'
import { CheckIcon, ChevronRightIcon, CopyIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { ChatMessage } from './model'

type Part = ChatMessage['parts'][number]

/** Between sending and the first token, when there is nothing else to show. */
export function Thinking() {
  const [tenths, setTenths] = useState(0)

  useEffect(() => {
    const tick = setInterval(() => setTenths((so_far) => so_far + 1), 100)
    return () => clearInterval(tick)
  }, [])

  return <Loading label="Thinking" seconds={tenths / 10} data-testid="chat-thinking" />
}

/** What you can do with a reply once it's finished arriving. */
export function ReplyActions({ text }: { text: string }) {
  const [copied, copy] = useCopy()

  return (
    <MessageActions className="text-ink-3">
      <MessageAction
        data-testid="message-copy"
        label={copied ? 'Copied' : 'Copy'}
        onClick={() => copy(text)}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </MessageAction>
    </MessageActions>
  )
}

/** Words fade in as they land, and a caret sits where the next one will go. */
const Text = ({ text, streaming }: { text: string; streaming: boolean }) => (
  <MessageResponse
    animated={{ animation: 'fadeIn', sep: 'word', duration: 260 }}
    isAnimating={streaming}
    {...(streaming ? { caret: 'block' as const } : {})}
  >
    {text}
  </MessageResponse>
)

/**
 * A summary you can open. The rows stay in the tree while shut — grid tracks
 * animate from `0fr`, which a height can't do without measuring first.
 */
function Expander({
  summary,
  testid,
  className = 'hover:bg-hover-2 -mx-1.5 px-1.5',
  open: initially = false,
  children,
}: {
  summary: ReactNode
  testid: string
  className?: string
  open?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(initially)

  return (
    <div className="w-full" data-testid={testid}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`text-ink-2 hover:text-ink rounded-control flex w-fit max-w-full items-center gap-1.5 py-1 text-left text-sm transition-colors ${className}`}
      >
        <ChevronRightIcon
          className={`size-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        {summary}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-1.5 pt-1.5">{children}</div>
        </div>
      </div>
    </div>
  )
}

/** What the model worked through before answering, folded away until asked. */
const Reasoning = ({ text, streaming }: { text: string; streaming: boolean }) => (
  <Expander
    testid="message-reasoning"
    summary={streaming ? <Shimmer>Thinking</Shimmer> : 'Thought it through'}
  >
    <Text text={text} streaming={streaming} />
  </Expander>
)

const json = (value: unknown) => JSON.stringify(value, null, 2) ?? 'undefined'

// Green when it came back, red when it didn't, orange while it's still out.
const DOT: Partial<Record<DynamicToolUIPart['state'], string>> = {
  'output-available': 'bg-green',
  'output-error': 'bg-red',
}

/**
 * One of your tools, called. The name rides on the part rather than in the type,
 * because you wrote the tool after the build — so there is one branch here and
 * not one per tool.
 */
const ToolChip = ({ part }: { part: DynamicToolUIPart }) => (
  <Expander
    testid="message-tool"
    className="border-line bg-inset hover:bg-hover rounded-chip border px-2"
    summary={
      <>
        <span
          className={`size-1.5 shrink-0 rounded-full ${DOT[part.state] ?? 'bg-orange'}`}
        />
        <span className="truncate">
          {part.state === 'output-error' ? (
            `${part.toolName} failed`
          ) : part.state === 'output-available' ? (
            part.toolName
          ) : (
            <Shimmer>{part.toolName}</Shimmer>
          )}
        </span>
      </>
    }
  >
    <CodeBlock label="Input" code={json(part.input)} />
    {part.state === 'output-available' && (
      <CodeBlock label="Output" code={json(part.output)} />
    )}
    {part.state === 'output-error' && (
      <p className="text-destructive text-sm">{part.errorText}</p>
    )}
  </Expander>
)

/** A run of calls as one line you can open, not a stack of boxes. */
const ToolCalls = ({ parts }: { parts: readonly DynamicToolUIPart[] }) => (
  <Expander
    testid="message-tools"
    // Open while anything is still out, so a call you're waiting on isn't hidden.
    open={parts.some((part) => part.state !== 'output-available')}
    summary={
      <span className="tabular-nums">
        {parts.length} tool call{parts.length === 1 ? '' : 's'}
      </span>
    }
  >
    {parts.map((part) => (
      <ToolChip key={part.toolCallId} part={part} />
    ))}
  </Expander>
)

type Chunk =
  | { readonly kind: 'tools'; readonly parts: readonly DynamicToolUIPart[] }
  | { readonly kind: 'part'; readonly part: Part; readonly last: boolean }

/** Consecutive calls travel together; everything else stands on its own. */
const chunk = (parts: ChatMessage['parts']): readonly Chunk[] =>
  parts.reduce<readonly Chunk[]>((chunks, part, index) => {
    if (part.type !== 'dynamic-tool')
      return [...chunks, { kind: 'part', part, last: index === parts.length - 1 }]

    const previous = chunks.at(-1)
    return previous?.kind === 'tools'
      ? [...chunks.slice(0, -1), { kind: 'tools', parts: [...previous.parts, part] }]
      : [...chunks, { kind: 'tools', parts: [part] }]
  }, [])

/**
 * Every part of a message the app has something to say about. Files and sources
 * still render nothing: a placeholder for data that never arrives is worse than
 * no placeholder.
 */
export function MessageParts({
  parts,
  streaming,
}: {
  parts: ChatMessage['parts']
  streaming: boolean
}) {
  return (
    <>
      {chunk(parts).map((piece, index) => {
        if (piece.kind === 'tools') return <ToolCalls key={index} parts={piece.parts} />
        // Only the last part is still growing; the ones above it are finished.
        const live = streaming && piece.last
        if (piece.part.type === 'text')
          return <Text key={index} text={piece.part.text} streaming={live} />
        if (piece.part.type === 'reasoning')
          return (
            <Reasoning
              key={index}
              text={piece.part.text}
              streaming={piece.part.state === 'streaming'}
            />
          )
        return null
      })}
    </>
  )
}
