import { write } from '@tiny/host'
import { useSyncExternalStore } from 'react'

/**
 * Which of the extensions this build brings the user has hidden. One key, not a
 * row each: default is on, so only the exceptions are stored, and a build that
 * drops an extension leaves nothing behind to clean up.
 *
 * Not an `Installed` row. That shape is a url or a source, a version and
 * something to delete, and a bundled extension has none of those.
 */
const KEY = 'tiny.extensions.off'

/** Hide this and there is no screen with a switch on it, so it is not offerable. */
export const MANAGER = 'extensions'

// Storage is the user's to edit, so the lock is enforced where the value is read
// rather than by leaving a switch off a row: `["extensions"]` typed in by hand
// would otherwise take the app with it.
const read = (): ReadonlySet<string> => {
  const raw: unknown = JSON.parse(localStorage.getItem(KEY) || '[]')
  const ids = Array.isArray(raw) ? raw.filter((one) => typeof one === 'string') : []
  return new Set(ids.filter((id) => id !== MANAGER))
}

// A module store, like the installed rows: the screen writes and the registry
// reads. Cached because `getSnapshot` compares by identity, and a fresh Set per
// call is a render loop.
let off: ReadonlySet<string> | undefined
const listeners = new Set<() => void>()

/** The ids the user has hidden. Reads are synchronous, so the first look is real. */
export const readOff = (): ReadonlySet<string> => (off ??= read())

// The cache lives only as long as something is watching it, so the next watcher
// starts from what is actually in storage.
export const subscribeOff = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) off = undefined
  }
}

/** Stored first, shown second — the same order the installed rows are written in. */
export const setOff = (id: string, hidden: boolean) => {
  const next = new Set(readOff())
  if (hidden) next.add(id)
  else next.delete(id)
  if (!write(KEY, JSON.stringify([...next]))) return
  off = next
  for (const listener of listeners) listener()
}

/** Everything you have hidden, live. */
export const useOff = (): ReadonlySet<string> =>
  useSyncExternalStore(subscribeOff, readOff)
