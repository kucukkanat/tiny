import { expect, test } from 'bun:test'
import { readBody, request, summarise, textFromHtml, type Result } from './fetch'

const answer = (body: BodyInit, type: string) =>
  new Response(body, { headers: { 'content-type': type } })

test('json and text come back as they were sent', async () => {
  expect(await readBody(answer('{"a":1}', 'application/json'))).toMatchObject({
    kind: 'json',
    body: '{"a":1}',
    truncated: false,
  })
  expect(await readBody(answer('plain', 'text/plain'))).toMatchObject({
    kind: 'text',
    body: 'plain',
  })
})

test('a json suffix type is still json, not binary', async () => {
  const read = await readBody(answer('{"a":1}', 'application/vnd.api+json'))

  expect(read.kind).toBe('json')
  expect(read.body).toBe('{"a":1}')
})

test('html loses its markup and keeps its words', () => {
  const text = textFromHtml(
    `<html><head><title>Prices</title><style>.a{color:red}</style></head>
     <body><script>track()</script><h1>BTC</h1><p>Up   today</p></body></html>`,
  )

  expect(text).toContain('Prices')
  expect(text).toContain('BTC')
  expect(text).toContain('Up today')
  expect(text).not.toContain('track()')
  expect(text).not.toContain('color:red')
})

test('a page is read through the same stripper the tool uses', async () => {
  const read = await readBody(
    answer('<body><p>hello</p><script>x()</script></body>', 'text/html'),
  )

  expect(read.kind).toBe('html')
  expect(read.body).toBe('hello')
})

test('a body past the cap is cut and says so', async () => {
  const read = await readBody(answer('x'.repeat(50_000), 'text/plain'))

  expect(read.truncated).toBe(true)
  expect(read.body.length).toBe(40_000)
  // The size reported is what arrived, not what survived — otherwise nobody
  // can tell how much was lost.
  expect(read.bytes).toBe(50_000)
})

test('an image is described rather than decoded', async () => {
  const read = await readBody(answer(new Uint8Array([137, 80, 78, 71]), 'image/png'))

  expect(read.kind).toBe('binary')
  expect(read.body).toBe('4 bytes of image/png, not text.')
})

test('an empty body is not mistaken for binary', async () => {
  const read = await readBody(new Response(null, { status: 204 }))

  expect(read.kind).toBe('text')
  expect(read.body).toBe('')
})

test('a URL that is not http is refused before anything is sent', () => {
  expect(request({ url: 'file:///etc/passwd', method: 'GET' })).rejects.toThrow(/http/)
})

test('a blocked read says it is CORS and says not to retry', async () => {
  // Nothing is listening on this port, which is the same rejection the browser
  // gives for a cross-origin read it will not make.
  const failed = await request({ url: 'http://127.0.0.1:9/x', method: 'GET' }).catch(
    (error: Error) => error.message,
  )

  expect(failed).toContain('Access-Control-Allow-Origin')
  expect(failed).toContain('will fail the same')
})

const result = (over: Partial<Result> = {}): Result => ({
  url: 'https://x.test/a',
  status: 200,
  ok: true,
  contentType: 'text/plain',
  headers: { 'x-noise': '1' },
  kind: 'text',
  body: 'hello',
  bytes: 5,
  truncated: false,
  ms: 12,
  ...over,
})

test('what the model is told is the body, without the headers or the timing', () => {
  const said = summarise(result())

  expect(said).toContain('200 text/plain — https://x.test/a')
  expect(said).toContain('hello')
  expect(said).not.toContain('x-noise')
  expect(said).not.toContain('12')
})

test('a cut body tells the model it was cut, so it does not read on', () => {
  expect(summarise(result({ truncated: true, bytes: 90_000 }))).toContain('cut at 40000')
})
