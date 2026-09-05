import { write } from '@tiny/host'
import { useSyncExternalStore } from 'react'
import { z } from 'zod'

/**
 * An extension as it sits in storage. Either it says where to fetch it or it
 * carries its own source — one or the other, never both. `title` is remembered
 * from the last time it loaded, so a row still has a name before anything runs.
 */
export type Installed = {
  /** Ours, not the extension's — its own id isn't known until it loads. */
  readonly id: string
  /** Where to fetch it, for one that came from somewhere else. */
  readonly url?: string
  /** The module itself, for one written or picked here. */
  readonly source?: string
  readonly title: string
  /**
   * Bumped by Reload, and by Run in the editor. For a URL it rides along as
   * `?v=` and beats the caches; for source it is what makes a fresh module out
   * of text that hasn't changed.
   */
  readonly version: number
  readonly enabled: boolean
}

// Unique enough to name a row, and available outside a secure context —
// `crypto.randomUUID` is not, which bites the moment you open the dev server on
// a phone over plain http.
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** Named after its file until it loads and says what it calls itself. */
export const newInstall = (url: string): Installed => ({
  id: newId(),
  url,
  title: url.split(/[/?#]/).filter(Boolean).at(-1) ?? url,
  version: 1,
  enabled: false,
})

/** One written here, or picked off the disk. There is no address to name it by. */
export const newSource = (source: string, title: string): Installed => ({
  id: newId(),
  source,
  title,
  version: 1,
  enabled: false,
})

// One key per extension, so saving one doesn't reserialize the rest.
const PREFIX = 'tiny.extension.'

// A row is one or the other. Refusing both here is what keeps every reader
// from having to wonder, and a half-written row still drops quietly.
const Stored = z
  .object({
    id: z.string(),
    url: z.string().optional(),
    source: z.string().optional(),
    title: z.string(),
    version: z.number(),
    enabled: z.boolean(),
  })
  .refine((one) => (one.url === undefined) !== (one.source === undefined))

// A missing key and unparseable JSON are the same answer: nothing usable.
const parse = (raw: string | null): unknown => {
  try {
    return JSON.parse(raw ?? '')
  } catch {
    return null
  }
}

const byTitle = (a: Installed, b: Installed) => a.title.localeCompare(b.title)

const read = (): readonly Installed[] =>
  Object.keys(localStorage)
    .filter((key) => key.startsWith(PREFIX))
    .map((key) => Stored.safeParse(parse(localStorage.getItem(key))))
    // Storage written by an older build is worth nothing, so drop it rather
    // than crash the screen that reads it.
    .flatMap((result) => (result.success ? [result.data] : []))
    .sort(byTitle)

// The store is a module, not a context: the screen writes and the loader reads.
let installed: readonly Installed[] | undefined
const listeners = new Set<() => void>()

/** Reads are synchronous, so the first look at the list is the real one. */
export const readInstalled = (): readonly Installed[] => (installed ??= read())

const publish = (next: readonly Installed[]) => {
  installed = [...next].sort(byTitle)
  for (const listener of listeners) listener()
}

// The cache lives only as long as something is watching it, so the next watcher
// starts from what is actually in storage.
export const subscribeInstalled = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) installed = undefined
  }
}

/**
 * Stored first, shown second. The other way round puts a row on screen that
 * isn't in storage, and it vanishes on the next reload with nothing said.
 */
export const saveInstalled = (one: Installed): boolean => {
  if (!write(PREFIX + one.id, JSON.stringify(one))) return false
  publish([one, ...readInstalled().filter((other) => other.id !== one.id)])
  return true
}

export const removeInstalled = (id: string) => {
  publish(readInstalled().filter((one) => one.id !== id))
  localStorage.removeItem(PREFIX + id)
}

/** Every extension you've installed, by name. */
export const useInstalled = (): readonly Installed[] =>
  useSyncExternalStore(subscribeInstalled, readInstalled)
