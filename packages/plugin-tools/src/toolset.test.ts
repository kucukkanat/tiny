import { renderHook } from '@testing-library/react'
import { expect, test } from 'bun:test'
import { useToolSet } from './toolset'

const WORKS = `tool({ execute: () => 'ok' })`

const seed = (id: string, name: string, source = WORKS, enabled = true) =>
  localStorage.setItem(`tiny.tool.${id}`, JSON.stringify({ id, name, source, enabled }))

const offered = () => Object.keys(renderHook(useToolSet).result.current)

test('the model gets the tools that are on and named', () => {
  seed('1', 'weather')
  seed('2', 'clock')

  expect(offered().sort()).toEqual(['clock', 'weather'])
})

test('a tool that is switched off is not offered', () => {
  seed('1', 'weather', WORKS, false)
  expect(offered()).toEqual([])
})

test('a half-written tool waits until it has a name', () => {
  seed('1', '')
  seed('2', 'not a name')

  expect(offered()).toEqual([])
})

test('one broken tool does not take the working ones with it', () => {
  seed('1', 'broken', 'tool({ oops')
  seed('2', 'weather')

  expect(offered()).toEqual(['weather'])
})

test('the same set comes back the same object, so chat keeps its agent', () => {
  seed('1', 'weather')
  const view = renderHook(useToolSet)
  const first = view.result.current
  view.rerender()

  expect(view.result.current).toBe(first)
})
