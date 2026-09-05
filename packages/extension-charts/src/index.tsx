import type { Extension } from '@tiny/host'
import { tool } from 'ai'
import { Fragment } from 'react'
import { z } from 'zod'

/**
 * What the model sends and, because `execute` hands it straight back, what the
 * drawing is given. A tool that computes nothing is still the right shape: it
 * is how a model asks for a picture, and `View` is what answers.
 */
const Chart = z.object({
  title: z.string().optional().describe('What the numbers are, in a few words'),
  rows: z
    .array(
      z.object({
        label: z.string().describe('What this bar is'),
        value: z.number().nonnegative().describe('How much, as a plain number'),
      }),
    )
    .min(1)
    .max(24)
    .describe('One per bar, in the order they should read'),
})

/**
 * Rows and not columns, because a phone is narrow and a label under an upright
 * bar has nowhere to go. Ordinary elements and not an SVG: a grid already
 * reflows, already truncates a long label, and its numbers are already
 * selectable — none of which a `viewBox` gives you.
 */
function Bars({ output }: { output: unknown }) {
  const read = Chart.safeParse(output)
  // Not ours to explain: chat keeps the raw output one press below this, which
  // is where you look when a drawing says it can't.
  if (!read.success)
    return (
      <p className="text-ink-3 text-sm" data-testid="chart">
        Not a chart.
      </p>
    )

  const { title, rows } = read.data
  // Never zero: every value being zero is a chart of empty bars, not a divide.
  const top = Math.max(...rows.map((row) => row.value), 1)

  return (
    <figure
      className="border-line bg-surface rounded-card flex flex-col gap-2 border p-3"
      data-testid="chart"
    >
      {title && <figcaption className="text-ink text-sm font-medium">{title}</figcaption>}
      {/* The label column is bounded at both ends: below 3rem it truncates
          everything, above 8rem it eats the bar it is labelling. */}
      <div className="grid grid-cols-[minmax(3rem,8rem)_1fr_auto] items-center gap-x-2 gap-y-1">
        {rows.map(({ label, value }) => (
          <Fragment key={label}>
            <span className="text-ink-2 truncate text-xs" title={label}>
              {label}
            </span>
            <span className="bg-hover-2 rounded-chip h-4 overflow-hidden">
              <span
                data-testid={`chart-bar-${label}`}
                className="bg-brand rounded-chip block h-full"
                style={{ width: `${(value / top) * 100}%` }}
              />
            </span>
            <span className="text-ink-3 text-xs tabular-nums">{value}</span>
          </Fragment>
        ))}
      </div>
    </figure>
  )
}

/**
 * The smallest thing that proves a tool can draw its own result: one tool, one
 * `View`, no dependency and no screen. What it demonstrates is the shape —
 * everything expensive about a picture belongs in the extension that wants one,
 * not in the app that hosts it.
 */
export default (): Extension => ({
  id: 'charts',
  title: 'Charts',

  instructions:
    'When an answer turns on comparing a handful of numbers, call `chart` to draw them rather than listing them. Say what they mean in words as well — the picture is not in your context afterwards, and it is not the whole answer.',

  tools: {
    chart: {
      ...tool({
        description: 'Draw labelled numbers as a bar chart in the reply.',
        inputSchema: Chart,
        // Nothing to compute. The drawing is the point, and what comes back
        // here is what `View` is handed.
        execute: (input) => input,
        // The model just sent these numbers; handing them back would spend them
        // in its context a second time, and again on every turn after this one.
        toModelOutput: () => ({ type: 'text', value: 'Drawn.' }),
      }),
      View: Bars,
    },
  },
})
