import { useSyncExternalStore } from 'react'

export type Store<T> = {
  get(): T
  set(next: T | ((prev: T) => T)): void
  subscribe(listener: () => void): () => void
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

/**
 * A JSON value in localStorage, readable as a React store.
 * Survives reload, and stays in sync across tabs via the `storage` event.
 */
export function persisted<T>(key: string, initial: T): Store<T> {
  let value = read(key, initial)
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())

  addEventListener('storage', (e) => {
    if (e.key !== key) return
    value = read(key, initial)
    emit()
  })

  return {
    get: () => value,
    set(next) {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        /* quota or private mode — keep the in-memory value */
      }
      emit()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
