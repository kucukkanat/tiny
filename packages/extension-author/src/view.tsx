import { Link } from 'react-router'
import { z } from 'zod'

/** What a write returns — small enough that it is also what the model reads. */
export const Written = z.object({
  id: z.string(),
  title: z.string(),
  enabled: z.boolean(),
  /** False for a replacement, so the card can say which happened. */
  created: z.boolean(),
})

/**
 * Where the thing the model just wrote actually is. A row lands switched off,
 * so without a way to reach the switch the write is invisible until someone
 * thinks to go looking on the Extensions screen.
 */
export function Wrote({ output }: { output: unknown }) {
  const read = Written.safeParse(output)
  // The chip underneath is where you read what really came back.
  if (!read.success)
    return (
      <p className="text-ink-3 text-sm" data-testid="author-wrote">
        Nothing was written.
      </p>
    )

  const { id, title, enabled, created } = read.data

  return (
    <div
      className="border-line bg-surface rounded-card flex flex-wrap items-center gap-x-3 gap-y-2 border p-3"
      data-testid="author-wrote"
    >
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-sm font-medium">{title}</p>
        <p className="text-ink-3 text-xs">
          {created ? 'Written' : 'Updated'}
          {enabled ? ' — running' : ' — off until you turn it on'}
        </p>
      </div>
      <Link
        to={`/extensions/${id}`}
        data-testid="author-open"
        className="border-line rounded-control h-control inline-flex items-center border px-4 text-sm"
      >
        Open
      </Link>
    </div>
  )
}
