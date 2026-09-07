import type { Extension } from '@tiny/host'
import { tool } from 'ai'
import { Ask, request, summarise, type Result } from './fetch'

const tone = (result: Result) =>
  result.ok ? 'bg-brand-tint text-brand' : 'bg-red-tint text-red'

const size = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 102.4) / 10} kB`

/**
 * The response as something to read rather than parse. Chat keeps the raw
 * input and output one press below this, so nothing here has to prove itself —
 * it only has to be quicker to read than the JSON it stands in for.
 */
function Fetched({ input, output }: { input: unknown; output: unknown }) {
  const asked = Ask.safeParse(input)
  const got = output as Result | null

  if (!asked.success || !got || typeof got.status !== 'number')
    return (
      <p className="text-ink-3 text-sm" data-testid="fetch-result">
        Not a response.
      </p>
    )

  return (
    <figure
      className="border-line bg-surface rounded-card overflow-hidden border"
      data-testid="fetch-result"
    >
      <figcaption className="border-line flex flex-wrap items-center gap-2 border-b p-3">
        <span
          className={`rounded-chip px-2 py-0.5 font-mono text-xs ${tone(got)}`}
          data-testid="fetch-status"
        >
          {asked.data.method} {got.status}
        </span>
        {/* Breaking anywhere is what keeps a long query string from widening
            the whole reply on a phone. */}
        <span
          className="text-ink-2 min-w-0 flex-1 break-all text-xs"
          data-testid="fetch-url"
        >
          {got.url}
        </span>
        <span className="text-ink-3 font-mono text-xs">
          {got.kind} · {size(got.bytes)} · {got.ms} ms
        </span>
      </figcaption>

      <pre
        className="text-ink max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-xs"
        data-testid="fetch-body"
      >
        {got.body}
      </pre>

      {got.truncated && (
        <p className="text-ink-3 border-line border-t px-3 py-2 text-xs">
          Cut short — the rest was not read.
        </p>
      )}
    </figure>
  )
}

export default (): Extension => ({
  id: 'fetch',
  title: 'Fetch',
  tools: {
    fetch: {
      ...tool({
        description:
          'Read a URL over HTTP. Returns the status, the response headers and the body — ' +
          'JSON and text as they came, HTML with the markup stripped to its readable text. ' +
          'Runs from the browser tab, so it can only read hosts that allow cross-origin requests.',
        inputSchema: Ask,
        execute: request,
        // `{ output }`, not `(output)` — see the note on `summarise`.
        toModelOutput: ({ output }) => ({ type: 'text', value: summarise(output) }),
      }),
      View: Fetched,
    },
  },
  instructions:
    'You can read URLs with the fetch tool. It runs in the browser with no proxy, so a host ' +
    'that does not send Access-Control-Allow-Origin cannot be read at all — when one fails ' +
    'that way, do not retry it; say so, or find an API for the same data. It sends any method, ' +
    'including ones that change state, so treat POST, PUT, PATCH and DELETE as things to ' +
    'confirm with the user in the conversation before calling.',
})
