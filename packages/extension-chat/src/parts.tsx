import {
  Safely,
  type IconName,
  type Message,
  type MessageAction,
  type Thread,
  type ToolView,
  type Viewed,
} from '@tiny/host'
import {
  // Aliased because the contract owns these two names: `MessageAction` here is
  // the button, and `MessageAction` above is the thing an extension registers.
  MessageAction as ActionButton,
  MessageActions as ActionRow,
  MessageResponse,
} from '@tiny/ui/components/ai-elements/message'
import { CodeBlock } from '@tiny/ui/components/code-block'
import { Loading, Shimmer } from '@tiny/ui/components/loading'
import { useCopy } from '@tiny/ui/hooks/use-copy'
import type { DynamicToolUIPart } from 'ai'
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  PlayIcon,
  PlusIcon,
  RotateCwIcon,
  SquareIcon,
  Trash2Icon,
  WandSparklesIcon,
} from 'lucide-react'
import {
  createElement,
  memo,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import type { ChatMessage } from './model'

type Part = ChatMessage['parts'][number]

/** Every tool that is live, which is where a drawing for one is kept. */
type Tools = Readonly<Record<string, Viewed>>

/** Between sending and the first token, when there is nothing else to show. */
export function Thinking() {
  const [tenths, setTenths] = useState(0)

  useEffect(() => {
    const tick = setInterval(() => setTenths((so_far) => so_far + 1), 100)
    return () => clearInterval(tick)
  }, [])

  return <Loading label="Thinking" seconds={tenths / 10} data-testid="chat-thinking" />
}

/**
 * The icons an extension can name. Every one is already in this bundle because
 * something else here draws it, so naming one costs nothing — which is the
 * whole reason the list is this list and not a nicer one.
 */
const ICONS: Record<IconName, ComponentType> = {
  add: PlusIcon,
  check: CheckIcon,
  copy: CopyIcon,
  play: PlayIcon,
  retry: RotateCwIcon,
  stop: SquareIcon,
  trash: Trash2Icon,
  wand: WandSparklesIcon,
}

const said = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

/** Enough to tell two buttons apart in a test, out of words meant for a person. */
const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/**
 * A name we ship, or nothing. `Object.hasOwn` and not a bare index: an object
 * literal inherits `Object.prototype`, so `icon: 'constructor'` would otherwise
 * answer with a function, and React would try to render it.
 */
const iconNamed = (icon: string): ComponentType | undefined =>
  Object.hasOwn(ICONS, icon) ? ICONS[icon as IconName] : undefined

/** Still going, whoever made the promise — a foreign one is not `instanceof`. */
const thenable = (value: void | Promise<void>): value is Promise<void> =>
  typeof (value as Promise<void> | undefined)?.then === 'function'

/**
 * One extension's button. It runs somebody else's code, so a throw is caught and
 * said out loud rather than left in the console — and the button is out of use
 * while a promise it returned is still going.
 */
function Extra({
  action,
  at,
  message,
  thread,
  onFail,
}: {
  action: MessageAction
  /** Its place in the fold, which is what names it when its label cannot. */
  at: number
  message: Message
  thread: Thread
  onFail: (problem: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const { icon, label } = action
  // A name we ship draws our icon, a component of your own draws itself, and any
  // other string is drawn as it is — an emoji, say.
  const Own =
    typeof icon === 'function'
      ? icon
      : typeof icon === 'string'
        ? iconNamed(icon)
        : undefined
  const glyph = Own ? undefined : typeof icon === 'string' ? icon : undefined
  // With none of the three there is only the label, and then it is drawn rather
  // than announced: words need a wider button, no tooltip repeating them, and
  // no second copy of themselves in the sr-only span the button appends.
  const marked = Boolean(Own || glyph)

  /**
   * A promise back means it is still going, so the button waits with it. Nothing
   * back means it is already over, and setting state either side of a call that
   * has already returned is two renders nobody sees.
   */
  const press = () => {
    onFail('')
    try {
      const going = action.run(message, thread)
      if (!thenable(going)) return
      setBusy(true)
      going.then(
        () => setBusy(false),
        (cause: unknown) => {
          setBusy(false)
          onFail(`${label}: ${said(cause)}`)
        },
      )
    } catch (cause) {
      onFail(`${label}: ${said(cause)}`)
    }
  }

  return (
    <ActionButton
      data-testid={`message-action-${slug(label) || at}`}
      // Copy gets away without a tooltip because everybody knows that icon.
      // Nobody knows this one, and the tooltip is what names it on a pointer.
      label={marked ? label : undefined}
      tooltip={marked ? label : undefined}
      size={marked ? 'icon-sm' : 'sm'}
      disabled={busy}
      onClick={press}
    >
      {/* `createElement` and not `<Own />`: it is not being defined here, it is
          the extension's own, and JSX here reads to the linter as a component
          declared in render. */}
      {Own ? createElement(Own) : (glyph ?? label)}
    </ActionButton>
  )
}

/**
 * Whether this button belongs on this message. `when` is extension code running
 * in render, in somebody else's screen — a throw here would take chat down and
 * name chat as what broke. Shown instead, which is the default anyway, and
 * whatever is wrong shows up attributed the moment it is pressed.
 */
const applies = (action: MessageAction, message: Message) => {
  try {
    return action.when?.(message) ?? true
  } catch {
    return true
  }
}

/**
 * What you can do with a message once it has finished arriving: copy it, and
 * whatever every live extension offered. A button that does not apply to this
 * message is better absent than disabled.
 */
export function MessageFooter({
  message,
  thread,
  actions,
}: {
  message: Message
  thread: Thread
  actions: readonly MessageAction[]
}) {
  const [copied, copy] = useCopy()
  const [failed, setFailed] = useState('')

  return (
    // `items-*` rather than `w-fit`: a failure is wider than the row, and a
    // column sized to its widest child would slide the buttons as it appeared.
    <div className="flex w-full flex-col items-start gap-1 group-[.is-user]:items-end">
      {/* Scrolls rather than wraps: several extensions and a phone is the case
          that breaks, and a second row would push the next message down. The
          padding is room for a focus ring, which `overflow` would otherwise
          clip; the negative margin gives it back. */}
      <ActionRow className="text-ink-3 -m-1 max-w-full overflow-x-auto p-1">
        <ActionButton
          data-testid="message-copy"
          label={copied ? 'Copied' : 'Copy'}
          onClick={() => copy(message.text)}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </ActionButton>
        {actions.map((action, at) =>
          applies(action, message) ? (
            // On its place in the whole fold, not in what survived `when`:
            // keyed on the filtered list, a button appearing above this one
            // would hand it another button's pending state.
            <Extra
              key={at}
              action={action}
              at={at}
              message={message}
              thread={thread}
              onFail={setFailed}
            />
          ) : null,
        )}
      </ActionRow>
      {failed && (
        <p className="text-destructive text-xs" data-testid="message-action-error">
          {failed}
        </p>
      )}
    </div>
  )
}

// Out here rather than inline: `MessageResponse` is memoised on its props, and
// a fresh object every render is a prop that never compares equal.
const FADE_IN = { animation: 'fadeIn', sep: 'word', duration: 260 } as const

/** Words fade in as they land, and a caret sits where the next one will go. */
const Text = ({ text, streaming }: { text: string; streaming: boolean }) => (
  <MessageResponse
    animated={FADE_IN}
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

/**
 * What draws this call's result, if its extension brought one. `Object.hasOwn`
 * and not a bare index, for the reason `iconNamed` above has it: a tool called
 * `constructor` would otherwise answer with a function off the prototype.
 */
const viewIn = (tools: Tools, name: string): ToolView | undefined =>
  Object.hasOwn(tools, name) ? tools[name]?.View : undefined

/**
 * A call that draws its own result, with the chip it replaced kept shut
 * underneath. Nothing is hidden by being drawn: the input and the raw answer
 * stay one press away, which is the only way to catch a drawing that doesn't
 * match what its tool actually returned.
 *
 * Only once there is an output. While the call is still out, or if it failed,
 * this is the chip on its own exactly as before — so the extension is never
 * handed half-arrived data, and never has a loading state to write.
 */
const Drawn = memo(
  ({ part, View }: { part: DynamicToolUIPart; View: ToolView }) =>
    part.state === 'output-available' ? (
      <div className="flex w-full flex-col gap-1.5">
        {/* Its own scroller: a chart wider than the thread should scroll, not
            widen the column every message is read in. */}
        <div className="w-full overflow-x-auto" data-testid="message-drawing">
          {/* Somebody else's component, rendering in our screen. Uncaught, a
              throw here takes the whole thread with it and names chat as what
              broke — and on a reload the hash would land straight back on it. */}
          <Safely name={part.toolName} resetKey={part.toolCallId}>
            <View input={part.input} output={part.output} />
          </Safely>
        </div>
        <ToolChip part={part} />
      </div>
    ) : (
      <ToolChip part={part} />
    ),
  // On the fields and not the object: a reply lands ten times a second and the
  // SDK hands back a shallow copy of every part each time, so identity never
  // holds — but what hangs off `output` is the same object throughout.
  (was, now) =>
    was.View === now.View &&
    was.part.state === now.part.state &&
    was.part.input === now.part.input &&
    was.part.output === now.part.output,
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
  | { readonly kind: 'drawn'; readonly part: DynamicToolUIPart; readonly View: ToolView }
  | { readonly kind: 'part'; readonly part: Part; readonly last: boolean }

/** Consecutive calls travel together; everything else stands on its own. */
const chunk = (parts: ChatMessage['parts'], tools: Tools): readonly Chunk[] =>
  parts.reduce<readonly Chunk[]>((chunks, part, index) => {
    if (part.type !== 'dynamic-tool')
      return [...chunks, { kind: 'part', part, last: index === parts.length - 1 }]

    // One that draws itself stands out of the run: folded in, a picture would
    // be buried behind the two shut expanders a run collapses to.
    const View = viewIn(tools, part.toolName)
    if (View) return [...chunks, { kind: 'drawn', part, View }]

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
  tools,
}: {
  parts: ChatMessage['parts']
  streaming: boolean
  /** Live now, not when this was said: uninstall one and its picture is JSON again. */
  tools: Tools
}) {
  return (
    <>
      {chunk(parts, tools).map((piece, index) => {
        if (piece.kind === 'tools') return <ToolCalls key={index} parts={piece.parts} />
        if (piece.kind === 'drawn')
          return <Drawn key={index} part={piece.part} View={piece.View} />
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
