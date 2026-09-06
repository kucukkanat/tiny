import { act, renderHook } from '@testing-library/react'
import { expect, test } from 'bun:test'
import {
  newInstall,
  removeInstalled,
  saveInstalled,
  titleIn,
  useInstalled,
} from './installed'

const watch = () => renderHook(useInstalled)

const seed = (id: string, title: string, enabled = true) =>
  localStorage.setItem(
    `tiny.extension.${id}`,
    JSON.stringify({ id, url: `https://x.dev/${id}.js`, title, version: 1, enabled }),
  )

test('one you add is there, and is still there after a reload', () => {
  const view = watch()
  act(() => void saveInstalled({ ...newInstall('https://x.dev/e.js'), title: 'Dice' }))

  expect(view.result.current.map((one) => one.title)).toEqual(['Dice'])
  view.unmount()

  expect(watch().result.current.map((one) => one.title)).toEqual(['Dice'])
})

test('the list reads in name order, not the order you added them', () => {
  seed('1', 'Zebra')
  seed('2', 'Aardvark')

  expect(watch().result.current.map((one) => one.title)).toEqual(['Aardvark', 'Zebra'])
})

test('a new one is off until you say otherwise', () => {
  expect(newInstall('https://x.dev/e.js').enabled).toBe(false)
})

test('turning one off keeps it — off is a state, not a delete', () => {
  seed('1', 'Dice')
  const view = watch()

  act(() => {
    const one = view.result.current[0]
    if (one) saveInstalled({ ...one, enabled: false })
  })
  view.unmount()

  expect(watch().result.current[0]?.enabled).toBe(false)
})

test('deleting takes it out of storage too, not just off the screen', () => {
  seed('1', 'Dice')
  const view = watch()
  act(() => removeInstalled('1'))

  expect(view.result.current).toEqual([])
  expect(localStorage.getItem('tiny.extension.1')).toBeNull()
})

test('storage from an older build is dropped, not fatal', () => {
  localStorage.setItem('tiny.extension.a', 'not json at all')
  localStorage.setItem('tiny.extension.b', JSON.stringify({ id: 'b' }))
  seed('c', 'Survivor')

  expect(watch().result.current.map((one) => one.title)).toEqual(['Survivor'])
})

test.each([
  ["export default () => ({ id: 'x', title: 'Dice' })", 'Dice'],
  ['export default () => ({ id: "x", title: "Dice" })', 'Dice'],
  // A word boundary is what keeps `subtitle:` from answering for `title:`.
  ["export default () => ({ subtitle: 'Roll one', title: 'Dice' })", 'Dice'],
  ["export default () => ({ id: 'x' })", undefined],
  // A backtick can carry an interpolation, and `${name}` is not a name.
  ['export default () => ({ title: `${name}` })', undefined],
  ['', undefined],
])('%s is called %s', (source, title) => {
  expect(titleIn(source)).toBe(title)
})
