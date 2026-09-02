import { act, renderHook } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { isToolName, newTool, removeTool, saveTool, useTools } from './tool'

const watch = () => renderHook(useTools)

const seed = (id: string, name: string, enabled = true) =>
  localStorage.setItem(
    `tiny.tool.${id}`,
    JSON.stringify({ id, name, source: 'tool({ execute: () => 1 })', enabled }),
  )

test('a tool you write is there, and is still there after a reload', () => {
  const view = watch()
  act(() => saveTool({ ...newTool(), name: 'weather' }))

  expect(view.result.current.map((one) => one.name)).toEqual(['weather'])
  view.unmount()

  expect(watch().result.current.map((one) => one.name)).toEqual(['weather'])
})

test('the list reads in name order, not the order you wrote them', () => {
  seed('1', 'zebra')
  seed('2', 'aardvark')

  expect(watch().result.current.map((one) => one.name)).toEqual(['aardvark', 'zebra'])
})

test('turning one off keeps it — off is a state, not a delete', () => {
  seed('1', 'weather')
  const view = watch()

  act(() => {
    const tool = view.result.current[0]
    if (tool) saveTool({ ...tool, enabled: false })
  })
  view.unmount()

  expect(watch().result.current[0]?.enabled).toBe(false)
})

test('deleting takes it out of storage too, not just off the screen', () => {
  seed('1', 'weather')
  const view = watch()
  act(() => removeTool('1'))

  expect(view.result.current).toEqual([])
  expect(localStorage.getItem('tiny.tool.1')).toBeNull()
})

test('storage from an older build is dropped, not fatal', () => {
  localStorage.setItem('tiny.tool.a', 'not json at all')
  localStorage.setItem('tiny.tool.b', JSON.stringify({ id: 'b' }))
  seed('c', 'survivor')

  expect(watch().result.current.map((one) => one.name)).toEqual(['survivor'])
})

test('a name is what a provider will take', () => {
  expect(isToolName('get_weather')).toBe(true)
  expect(isToolName('get-weather-2')).toBe(true)
  expect(isToolName('')).toBe(false)
  expect(isToolName('get weather')).toBe(false)
  expect(isToolName('a'.repeat(65))).toBe(false)
})
