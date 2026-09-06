import { expect, test } from 'bun:test'
import { parseMarkdownIntoBlocks } from 'streamdown'
import { splitBlocks } from './message'

// A reply arrives a chunk at a time, and what we hand streamdown is only right
// if re-lexing from the tail lands where lexing the whole string would.
const REPLY = `# A heading

Some prose with **bold** in it.

- one
- two

\`\`\`ts
const x = 1
console.log(x)
\`\`\`

A closing paragraph.

> and a quote
`

test('growing a reply a chunk at a time gives the blocks a full lex would', () => {
  for (let at = 1; at <= REPLY.length; at += 7) {
    const text = REPLY.slice(0, at)
    expect(splitBlocks(text)).toEqual(parseMarkdownIntoBlocks(text))
  }
})

test('a reply that did not grow from the last one is lexed whole', () => {
  splitBlocks(REPLY)
  const other = '# Something else\n\nunrelated\n'
  expect(splitBlocks(other)).toEqual(parseMarkdownIntoBlocks(other))
})

test('the same text twice gives the same blocks, and a fresh array', () => {
  const once = splitBlocks(REPLY)
  const twice = splitBlocks(REPLY)
  expect(twice).toEqual(once)
  expect(twice).not.toBe(once)
})
