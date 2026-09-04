import { cn } from '@tiny/ui/lib/utils'
import type { ComponentProps } from 'react'

/** A band of brighter ink sweeping across the words: something is happening. */
export const Shimmer = ({ children }: { children: string }) => (
  <span className="animate-shimmer bg-[length:200%_100%] bg-clip-text text-transparent [background-image:linear-gradient(90deg,var(--ink-3)_0%,var(--ink-3)_40%,var(--ink)_50%,var(--ink-3)_60%,var(--ink-3)_100%)]">
    {children}
  </span>
)

// Nine cells, one keyframe, offset by where the cell sits: the delay is the
// whole animation. Reading down the columns gives the diagonal sweep.
const DELAYS = [90, 180, 270, 0, 90, 180, 90, 180, 270]

const PixelGrid = () => (
  <span aria-hidden className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]">
    {DELAYS.map((delay, cell) => (
      <span
        key={cell}
        className="animate-pixel bg-ink size-[4px] rounded-[1px]"
        style={{ animationDelay: `${delay}ms` }}
      />
    ))}
  </span>
)

/**
 * Waiting, with something to watch and a clock. The clock is the point: a
 * shimmer on its own can't tell you it's still going rather than stuck.
 */
export const Loading = ({
  label,
  seconds,
  className,
  ...props
}: { label: string; seconds?: number } & ComponentProps<'div'>) => (
  <div
    role="status"
    // Merged, not replaced: a caller placing this in a grid shouldn't have to
    // restate how the row itself is laid out.
    className={cn('flex w-fit items-center gap-2.5 text-sm', className)}
    {...props}
  >
    <PixelGrid />
    <Shimmer>{label}</Shimmer>
    {seconds !== undefined && (
      <span className="text-ink-3 font-mono text-xs tabular-nums">
        {seconds.toFixed(1)}s
      </span>
    )}
  </div>
)
