'use client'

import { Button } from '@tiny/ui/components/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tiny/ui/components/tooltip'
import { cn } from '@tiny/ui/lib/utils'
import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import type { UIMessage } from 'ai'
import type { ComponentProps, HTMLAttributes } from 'react'
import { memo } from 'react'
import { Streamdown, parseMarkdownIntoBlocks } from 'streamdown'

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage['role']
}

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      'group flex w-full max-w-[95%] flex-col gap-2',
      from === 'user' ? 'is-user ml-auto justify-end' : 'is-assistant',
      className,
    )}
    {...props}
  />
)

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      // `w-fit` on the assistant side sizes the column to its own content, so a
      // child asking for 100% resolves against nothing and an SVG collapses to
      // the replaced-element default. Text was already capped upstream.
      'is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm group-[.is-assistant]:w-full',
      'group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground',
      'group-[.is-assistant]:text-foreground',
      className,
    )}
    {...props}
  >
    {children}
  </div>
)

export type MessageActionsProps = ComponentProps<'div'>

export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div className={cn('flex items-center gap-1', className)} {...props}>
    {children}
  </div>
)

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string
  label?: string
}

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = 'ghost',
  size = 'icon-sm',
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  )

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return button
}

export type MessageResponseProps = ComponentProps<typeof Streamdown>

// A fence that is still arriving is a different string every 100ms, and shiki
// has no incremental mode — it keys its cache on the length, so every prefix
// misses and re-tokenises the whole block. At 9 kB that is 128ms of work per
// 100ms tick. Wait for the fence to stop moving; streamdown draws the plain
// block until colour arrives, which is what was on screen in the meantime.
let pending: ReturnType<typeof setTimeout> | undefined
const settled: typeof code = {
  ...code,
  highlight: (options, notify) => {
    const hit = code.highlight(options, notify)
    if (hit || !notify) return hit
    clearTimeout(pending)
    pending = setTimeout(() => code.highlight(options, notify), 250)
    return null
  },
}

// No mermaid: it is a static import, so its core, d3 and rough land in the
// first paint whether or not a reply ever draws a diagram — 16 extra requests
// and a quarter of the payload. Mermaid fences render as code blocks.
const streamdownPlugins = { cjk, code: settled, math }

// A reply only ever appends, so every block but the last is already settled —
// but streamdown re-lexes the whole string on every tick, and marked's block
// lexer rescans the tail once per block, so that is quadratic in blocks and
// cubic over a reply. Re-lex from the last block's start instead. Module-level
// because it sits in a `useMemo` dep array; a miss falls back to a full lex, so
// a shared one-entry cache is self-correcting.
let seen: { text: string; blocks: readonly string[] } = { text: '', blocks: [] }

// Two blocks kept back, not one: a boundary can change retroactively — a setext
// underline, a link-reference definition — one block after it was written.
export const splitBlocks = (text: string): string[] => {
  if (text === seen.text) return [...seen.blocks]
  const keep =
    text.startsWith(seen.text) && seen.blocks.length > 2 ? seen.blocks.length - 2 : 0
  const head = seen.blocks.slice(0, keep)
  const at = head.reduce((n, block) => n + block.length, 0)
  const blocks = [...head, ...parseMarkdownIntoBlocks(text.slice(at))]
  seen = { text, blocks }
  return blocks
}

// Plain `memo`, so every prop counts. It was a comparator on `children` and
// `isAnimating` alone, which meant a third prop could never take — and the
// reason it needed one, an `animated` object built inline on each render, is
// fixed where that object is written instead.
export const MessageResponse = memo(
  ({ className, plugins, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn('size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}
      // Merged, not replaced. It used to sit ahead of the spread, so a caller
      // wanting one more plugin silently dropped cjk, code and math instead.
      plugins={{ ...streamdownPlugins, ...plugins }}
      parseMarkdownIntoBlocksFn={splitBlocks}
      {...props}
    />
  ),
)

MessageResponse.displayName = 'MessageResponse'
