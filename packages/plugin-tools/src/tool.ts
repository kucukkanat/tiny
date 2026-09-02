import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import { newId } from './id'
import { TEMPLATES } from './templates'

/** A tool you wrote. What it takes and what it says it does live in `source`. */
export type UserTool = {
  readonly id: string
  readonly name: string
  /** A `tool({ ... })` expression. See `compile`. */
  readonly source: string
  readonly enabled: boolean
}

/** What a provider will accept as a tool name, and what the model will call. */
export const isToolName = (name: string) => /^[a-zA-Z0-9_-]{1,64}$/.test(name)

export const newTool = (): UserTool => ({
  id: newId(),
  name: '',
  source: TEMPLATES[0].source,
  enabled: true,
})

// One key per tool, so saving one doesn't reserialize the rest.
const PREFIX = 'tiny.tool.'

const Stored = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  enabled: z.boolean(),
})

// A missing key and unparseable JSON are the same answer: nothing usable.
const parse = (raw: string | null): unknown => {
  try {
    return JSON.parse(raw ?? '')
  } catch {
    return null
  }
}

const byName = (a: UserTool, b: UserTool) => a.name.localeCompare(b.name)

const read = (): readonly UserTool[] =>
  Object.keys(localStorage)
    .filter((key) => key.startsWith(PREFIX))
    .map((key) => Stored.safeParse(parse(localStorage.getItem(key))))
    // Storage written by an older build is worth nothing, so drop it rather
    // than crash the screen that reads it.
    .flatMap((result) => (result.success ? [result.data] : []))
    .sort(byName)

// The store is a module, not a context: the tools screen writes and the chat
// screen reads, and they are siblings under the shell.
let tools: readonly UserTool[] | undefined
const listeners = new Set<() => void>()

// Reads are synchronous, so there is no loading state to wait out — the first
// look at the list is already the real one.
const snapshot = (): readonly UserTool[] => (tools ??= read())

const publish = (next: readonly UserTool[]) => {
  tools = [...next].sort(byName)
  for (const listener of listeners) listener()
}

// The cache lives only as long as something is watching it, so the next watcher
// starts from what is actually in storage.
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) tools = undefined
  }
}

export const saveTool = (tool: UserTool) => {
  publish([tool, ...snapshot().filter((one) => one.id !== tool.id)])
  localStorage.setItem(PREFIX + tool.id, JSON.stringify(tool))
}

export const removeTool = (id: string) => {
  publish(snapshot().filter((one) => one.id !== id))
  localStorage.removeItem(PREFIX + id)
}

/** Every tool you have written, by name. */
export const useTools = (): readonly UserTool[] =>
  useSyncExternalStore(subscribe, snapshot)
