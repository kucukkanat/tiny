import { describe, expect, it, vi } from 'vitest'
import { persisted } from './index'

describe('persisted', () => {
  it('reads back what a previous session wrote', () => {
    persisted('count', 0).set(7)
    expect(persisted('count', 0).get()).toBe(7)
  })

  it('falls back to the initial value when storage holds junk', () => {
    localStorage.setItem('broken', '{not json')
    expect(persisted('broken', 'fallback').get()).toBe('fallback')
  })

  it('updates from the previous value and notifies subscribers', () => {
    const store = persisted<string[]>('list', [])
    const listener = vi.fn()
    store.subscribe(listener)

    store.set((prev) => [...prev, 'a'])
    store.set((prev) => [...prev, 'b'])

    expect(store.get()).toEqual(['a', 'b'])
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stops notifying after unsubscribe', () => {
    const store = persisted('n', 0)
    const listener = vi.fn()
    store.subscribe(listener)()
    store.set(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps the value in memory when storage refuses the write', () => {
    const store = persisted('big', 'small')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    store.set('huge')
    expect(store.get()).toBe('huge')
    vi.restoreAllMocks()
  })
})
