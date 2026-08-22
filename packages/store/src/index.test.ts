import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WRITE_DELAY_MS, persisted } from './index'

/** Storage writes are deferred, so a test that reads them back has to let the timer run. */
const settle = () => vi.advanceTimersByTime(WRITE_DELAY_MS)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('persisted', () => {
  it('reads back what a previous session wrote', () => {
    persisted('count', 0).set(7)
    settle()
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

  it('reads the new value immediately, before it reaches storage', () => {
    const store = persisted('draft', '')
    store.set('typed')
    expect(store.get()).toBe('typed')
    expect(localStorage.getItem('draft')).toBeNull()
    settle()
    expect(localStorage.getItem('draft')).toBe('"typed"')
  })

  it('collapses a burst of writes into one — a streamed reply must not rewrite storage per token', () => {
    const store = persisted('reply', '')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    for (let i = 0; i < 500; i++) store.set((prev) => prev + 'token ')
    settle()
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('reply')!)).toHaveLength(3000)
    setItem.mockRestore()
  })

  it('flushes a pending write before the page goes away', () => {
    const store = persisted('unsaved', '')
    store.set('typed')
    dispatchEvent(new Event('pagehide'))
    expect(localStorage.getItem('unsaved')).toBe('"typed"')
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
    settle()
    expect(store.get()).toBe('huge')
    vi.restoreAllMocks()
  })
})
