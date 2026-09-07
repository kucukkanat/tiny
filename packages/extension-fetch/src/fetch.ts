import { z } from 'zod'

/**
 * What the model asks for. Four fields and no fifth: `as: 'json' | 'text'` and
 * a tunable size cap were both written and both cut, because the content type
 * already says which one it is and a model guessing its own budget guesses
 * wrong in the expensive direction.
 */
export const Ask = z.object({
  url: z.string().describe('Absolute http:// or https:// URL'),
  method: z
    .enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])
    .default('GET')
    .describe('HTTP method. GET unless you mean to change something'),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe('Extra request headers, e.g. Authorization or Accept'),
  body: z
    .string()
    .optional()
    .describe('Request body, already serialised. Set Content-Type yourself'),
})

export type Ask = z.infer<typeof Ask>

/** How the body was read, which is what decides how to read it back. */
export type Kind = 'json' | 'html' | 'text' | 'binary'

export type Result = {
  /** Where it ended up, which is not where it was sent if anything redirected. */
  readonly url: string
  readonly status: number
  readonly ok: boolean
  readonly contentType: string
  readonly headers: Readonly<Record<string, string>>
  readonly kind: Kind
  /** Extracted for HTML, decoded otherwise, and a note of the size for binary. */
  readonly body: string
  readonly bytes: number
  readonly truncated: boolean
  readonly ms: number
}

/**
 * A reply is spent in the model's context on every turn after this one, so the
 * cap is on what the model can afford rather than on what the wire can carry.
 * 40k characters is roughly 10k tokens: a long article, most of a spec page,
 * and about a tenth of a minified bundle — which is the case it exists for.
 */
const LIMIT = 40_000

const TIMEOUT = 30_000

// Nothing else is a document. `+json` and `+xml` suffixes are real and common
// enough that matching the prefix alone reads the wrong half of `application/`.
const TEXTUAL = /^text\/|^application\/(json|xml|javascript|x-ndjson)|\+(json|xml)\b/

const isHtml = (type: string) => /^text\/html|^application\/xhtml/.test(type)

/**
 * The readable half of a page. A model handed raw HTML spends most of its
 * context on `<script>` and class attributes, so the markup is parsed and
 * thrown away — which the browser will do for free, and which is the whole
 * reason this is worth having over the model calling `fetch` in its head.
 */
export const textFromHtml = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const node of doc.querySelectorAll('script, style, noscript, svg, template'))
    node.remove()

  const title = doc.querySelector('title')?.textContent?.trim() ?? ''
  const text = (doc.body?.textContent ?? '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')

  return [title, text.trim()].filter(Boolean).join('\n\n')
}

const clip = (text: string): { body: string; truncated: boolean } =>
  text.length > LIMIT
    ? { body: text.slice(0, LIMIT), truncated: true }
    : { body: text, truncated: false }

/**
 * Given a real `Response`, what to hand back. Split out because it is the half
 * with all the decisions in it and a `Response` is constructible — so the tests
 * are the actual code path with a real body, not a stand-in for it.
 */
export const readBody = async (
  response: Response,
): Promise<{ kind: Kind; body: string; bytes: number; truncated: boolean }> => {
  const type = response.headers.get('content-type') ?? ''
  const buffer = await response.arrayBuffer()
  const bytes = buffer.byteLength

  // Decoding a PNG produces a screenful of replacement characters and tells
  // nobody anything. Say what it is and how big instead.
  if (bytes > 0 && !TEXTUAL.test(type))
    return {
      kind: 'binary',
      body: `${bytes} bytes of ${type || 'unknown type'}, not text.`,
      bytes,
      truncated: false,
    }

  const text = new TextDecoder().decode(buffer)
  if (isHtml(type)) return { kind: 'html', ...clip(textFromHtml(text)), bytes }

  return { kind: type.includes('json') ? 'json' : 'text', ...clip(text), bytes }
}

/**
 * Why it didn't happen, in terms the model can act on. `fetch` rejects with a
 * bare `TypeError: Failed to fetch` for a blocked cross-origin read, a dead
 * host and a refused connection alike, and a model told only that will retry
 * the same URL until it gives up.
 */
const reason = (error: unknown, url: string): string => {
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return `${url} did not answer within ${TIMEOUT / 1000}s.`

  return (
    `Could not read ${url}. This app is a browser tab with no server behind it, ` +
    `so a cross-origin read only works when the site sends ` +
    `Access-Control-Allow-Origin — most pages do not, and most public APIs do. ` +
    `There is no proxy to fall back to, so retrying this URL will fail the same ` +
    `way. Try an API for the same data, or tell the user what to open themselves.`
  )
}

/** Every header, since which ones mattered is not knowable from here. */
const headersOf = (response: Response): Record<string, string> =>
  Object.fromEntries(response.headers.entries())

export const request = async (ask: Ask): Promise<Result> => {
  const url = new URL(ask.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error(`${url.protocol} is not a URL this can fetch. Use http or https.`)

  const started = Date.now()
  const response = await fetch(url, {
    method: ask.method,
    headers: ask.headers,
    body: ask.body,
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch((error: unknown) => {
    throw new Error(reason(error, url.href))
  })

  return {
    url: response.url || url.href,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type') ?? '',
    headers: headersOf(response),
    ms: Date.now() - started,
    ...(await readBody(response)),
  }
}

/**
 * What the model is told, as against what the drawing is given. The header map
 * and the timing are for the person reading the reply; sending them costs
 * context on every subsequent turn and has never once changed an answer.
 *
 * Note the argument: the SDK hands `{ toolCallId, input, output }`, so a
 * summary written against the output alone describes the wrapper and reports
 * nothing fetched for a call that worked.
 */
export const summarise = (result: Result): string => {
  const head = `${result.status} ${result.contentType || 'no content-type'} — ${result.url}`
  const tail = result.truncated
    ? `\n\n[cut at ${LIMIT} characters of ${result.bytes} bytes]`
    : ''

  return `${head}\n\n${result.body}${tail}`
}
