import { expect, test } from 'bun:test'
import { refuse } from './url'

test('an address that is not one says so', () => {
  expect(refuse('')).toContain('Paste')
  expect(refuse('https://[not-a-host')).toContain('not an address')
})

test('a pinned jsDelivr address is fine', () => {
  expect(refuse('https://cdn.jsdelivr.net/gh/me/ext@v1.2.0/dist/ext.js')).toBeUndefined()
  expect(refuse('https://cdn.jsdelivr.net/npm/my-ext@1.0.0/dist/ext.js')).toBeUndefined()
})

test('a branch address is turned down, because a week is a long time', () => {
  // The browser holds these for seven days, so an update would look like a no-op.
  for (const ref of ['main', 'master', 'latest', 'HEAD'])
    expect(refuse(`https://cdn.jsdelivr.net/gh/me/ext@${ref}/dist/ext.js`)).toContain(
      'Pin a tag',
    )
  expect(refuse('https://cdn.jsdelivr.net/gh/me/ext/dist/ext.js')).toContain('Pin a tag')
})

test('the two GitHub addresses that look right and are not', () => {
  expect(refuse('https://raw.githubusercontent.com/me/ext/main/ext.js')).toContain(
    'plain text',
  )
  expect(refuse('https://gist.githubusercontent.com/me/abc/raw/ext.js')).toContain(
    'plain text',
  )
})

test('one served with the app needs no ceremony', () => {
  expect(refuse('./extensions/starter.js')).toBeUndefined()
})

test('http from an https page is refused, because Safari will not load it', () => {
  // happy-dom's own handle for pretending the page is somewhere else.
  const { happyDOM } = window as unknown as {
    happyDOM: { setURL: (url: string) => void }
  }
  const before = location.href
  happyDOM.setURL('https://tiny.dev/')

  expect(refuse('http://localhost:4173/ext.js')).toContain('Safari')
  expect(refuse('https://x.dev/ext.js')).toBeUndefined()

  happyDOM.setURL(before)
})
