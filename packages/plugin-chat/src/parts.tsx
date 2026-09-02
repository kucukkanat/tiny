import {
  MessageAction,
  MessageActions,
  MessageResponse,
} from '@tiny/ui/components/ai-elements/message'
import { CheckIcon, ChevronRightIcon, CopyIcon } from 'lucide-react'
import type { DynamicToolUIPart } from 'ai'
import { useEffect, useState, type ReactNode } from 'react'
import type { ChatMessage } from './model'

/** A band of brighter ink sweeping across the words: something is happening. */
const Shimmer = ({ children }: { children: string }) => (
  <span className="animate-shimmer bg-[length:200%_100%] bg-clip-text text-transparent [background-image:linear-gradient(90deg,var(--ink-3)_0%,var(--ink-3)_40%,var(--ink)_50%,var(--ink-3)_60%,var(--ink-3)_100%)]">
    {children}
  </span>
)

/**
 * Between sending and the first token, when there is nothing else to show.
 * The count is the point: a shimmer alone can't tell you it's still going.
 */
export function Thinking() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const tick = setInterval(() => setSeconds((so_far) => so_far + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  return (
    <div className="flex items-center gap-2 text-sm" data-testid="chat-thinking">
      <Shimmer>Thinking</Shimmer>
      {seconds > 0 && <span className="text-ink-3 tabular-nums">{seconds}s</span>}
    </div>
  )
}

/** What you can do with a reply once it's finished arriving. */
export function ReplyActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  // Shown, not hovered into view: there is no hover on a phone.
  useEffect(() => {
    if (!copied) return
    const clear = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(clear)
  }, [copied])

  return (
    <MessageActions className="text-ink-3">
      <MessageAction
        data-testid="message-copy"
        label={copied ? 'Copied' : 'Copy'}
        onClick={() => {
          void navigator.clipboard?.writeText(text)
          setCopied(true)
        }}
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

/** A block folded away until asked for: what reasoning and tool calls share. */
const Disclosure = ({
  label,
  testid,
  children,
}: {
  label: ReactNode
  testid: string
  children: ReactNode
}) => (
  <details
    className="group border-line bg-inset rounded-card w-full border"
    data-testid={testid}
  >
    <summary className="text-ink-2 hover:text-ink flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm">
      <ChevronRightIcon className="size-4 shrink-0 transition-transform group-open:rotate-90" />
      {label}
    </summary>
    <div className="border-line text-ink-2 border-t px-3 py-2 text-sm">{children}</div>
  </details>
)

/** What the model worked through before answering, folded away until asked. */
const Reasoning = ({ text, streaming }: { text: string; streaming: boolean }) => (
  <Disclosure
    testid="message-reasoning"
    label={streaming ? <Shimmer>Thinking</Shimmer> : 'Thought it through'}
  >
    <Text text={text} streaming={streaming} />
  </Disclosure>
)

const Code = ({ value }: { value: unknown }) => (
  <pre className="overflow-x-auto text-xs">{JSON.stringify(value, null, 2)}</pre>
)

/**
 * One of your tools, called. The name rides on the part rather than in the type,
 * because you wrote the tool after the build — so there is one branch here and
 * not one per tool.
 */
const ToolCall = ({ part }: { part: DynamicToolUIPart }) => (
  <Disclosure
    testid="message-tool"
    label={
      part.state === 'output-available' ? (
        part.toolName
      ) : part.state === 'output-error' ? (
        `${part.toolName} failed`
      ) : (
        <Shimmer>{part.toolName}</Shimmer>
      )
    }
  >
    <Code value={part.input} />
    {part.state === 'output-available' && <Code value={part.output} />}
    {part.state === 'output-error' && (
      <p className="text-destructive">{part.errorText}</p>
    )}
  </Disclosure>
)

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
      {parts.map((part, index) => {
        // Only the last part is still growing; the ones above it are finished.
        const live = streaming && index === parts.length - 1
        if (part.type === 'text')
          return <Text key={index} text={part.text} streaming={live} />
        if (part.type === 'reasoning')
          return (
            <Reasoning
              key={index}
              text={part.text}
              streaming={part.state === 'streaming'}
            />
          )
        if (part.type === 'dynamic-tool') return <ToolCall key={index} part={part} />
        return null
      })}
    </>
  )
}
