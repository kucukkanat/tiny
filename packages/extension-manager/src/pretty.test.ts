import { expect, test } from 'bun:test'
import { prettify } from './pretty'

test('it lays out a squashed module in the style the repo is written in', async () => {
  const out = await prettify('const a={x:1,y:2};export default function(t){return a}')

  expect(out).toBe(
    'const a = { x: 1, y: 2 }\nexport default function (t) {\n  return a\n}\n',
  )
})

test('it reads JSX, which is what you are writing here', async () => {
  const out = await prettify('const v = <div className="a"><b>hi</b></div>')

  expect(out).toBe('const v = (\n  <div className="a">\n    <b>hi</b>\n  </div>\n)\n')
})

test('it refuses what it cannot parse rather than returning half of it', () => {
  expect(prettify('const = ')).rejects.toThrow()
})
