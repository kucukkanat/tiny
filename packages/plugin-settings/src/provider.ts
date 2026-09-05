import { write, type Provider, type ProviderSpec } from '@tiny/plugin-host'
import { useMemo, useSyncExternalStore } from 'react'

/** Every dialect the app can speak, built-in or added by an extension. */
export type Registry = Readonly<Record<string, ProviderSpec>>

/** What a fresh install points at. */
const DEFAULT_KIND = 'anthropic'

/** Enough to ask the endpoint what it can do. */
export const hasCredentials = (provider: Provider): boolean =>
  provider.apiKey.length > 0 && URL.canParse(provider.baseUrl)

/** Enough to make a model call — including something that knows how to make it. */
export const isUsable = (provider: Provider, specs: Registry): boolean =>
  hasCredentials(provider) &&
  provider.model.length > 0 &&
  specs[provider.kind] !== undefined

// One string per field — nothing to parse, so nothing to fail on.
const storageKey = (field: string) => `tiny.provider.${field}`

/** What is actually in storage, before anything is made of it. */
type Stored = Readonly<Record<'kind' | 'baseUrl' | 'apiKey' | 'model', string>>

const readStored = (): Stored => ({
  kind: localStorage.getItem(storageKey('kind')) || DEFAULT_KIND,
  baseUrl: localStorage.getItem(storageKey('baseUrl')) ?? '',
  apiKey: localStorage.getItem(storageKey('apiKey')) ?? '',
  model: localStorage.getItem(storageKey('model')) ?? '',
})

/**
 * The stored kind is carried through even when nothing answers to it. An
 * extension that is switched off, or still being fetched, must not have the
 * provider you chose quietly rewritten to something else — you'd come back to
 * find your endpoint changed.
 */
const resolve = (stored: Stored, specs: Registry): Provider => ({
  ...stored,
  baseUrl: stored.baseUrl || specs[stored.kind]?.baseUrl || '',
})

// A module store, like tools and conversations: Settings and chat are siblings
// under the shell and both need the same answer, live.
let stored: Stored | undefined
const listeners = new Set<() => void>()

const snapshot = (): Stored => (stored ??= readStored())

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stored = undefined
  }
}

/** A patch changes what it names and nothing else. */
const updateProvider = (patch: Partial<Stored>) => {
  const next = { ...snapshot(), ...patch }
  stored = next
  // Every field is a string, so the provider itself is the write list.
  for (const [field, value] of Object.entries(next)) write(storageKey(field), value)
  for (const listener of listeners) listener()
}

/** What is stored, read fresh, made sense of by the dialects on offer. */
export const readProvider = (specs: Registry): Provider => resolve(readStored(), specs)

export function useProvider(
  specs: Registry,
): readonly [Provider, (patch: Partial<Stored>) => void] {
  const raw = useSyncExternalStore(subscribe, snapshot)
  // Memoised because chat builds its agent from this: a fresh object every
  // render would be a fresh agent every render.
  return [useMemo(() => resolve(raw, specs), [raw, specs]), updateProvider]
}

// The list the endpoint last gave us. Kept because reloading shouldn't cost a
// round trip, and because the composer picks from it without asking again.
const MODELS_KEY = 'tiny.provider.models'

export const readModels = (): readonly string[] => {
  // Storage is the user's to edit; a value that isn't a list means no list.
  const raw: unknown = JSON.parse(localStorage.getItem(MODELS_KEY) || 'null')
  return Array.isArray(raw) ? raw.filter((one) => typeof one === 'string') : []
}

export const writeModels = (models: readonly string[]) =>
  write(MODELS_KEY, JSON.stringify(models))
