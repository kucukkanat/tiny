import { useCallback, useState } from 'react'

export const THEMES = ['dark', 'light', 'system'] as const

export type Theme = (typeof THEMES)[number]

const STORAGE_KEY = 'tiny.theme'

export const isTheme = (value: unknown): value is Theme =>
  THEMES.some((theme) => theme === value)

/** Dark first: nothing stored means dark, not whatever the OS happens to prefer. */
export const readTheme = (): Theme => {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isTheme(stored) ? stored : 'dark'
}

// One retained query: a MediaQueryList nobody holds on to can be collected,
// and its listener goes with it.
let systemQuery: MediaQueryList | undefined
const systemIsDark = () =>
  (systemQuery ??= window.matchMedia('(prefers-color-scheme: dark)'))

/** Every token hangs off `.dark`, so flipping that one class is the whole job. */
export const applyTheme = (theme: Theme): void => {
  const dark = theme === 'system' ? systemIsDark().matches : theme === 'dark'
  document.documentElement.classList.toggle('dark', dark)

  // Mobile browser chrome is painted from this, so it has to move with the rest.
  const background = getComputedStyle(document.documentElement)
    .getPropertyValue('--background')
    .trim()
  if (background)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', background)
}

/** Keeps `system` following the OS wherever the user is in the app. */
export const watchSystemTheme = (): void => {
  systemIsDark().addEventListener('change', () => {
    if (readTheme() === 'system') applyTheme('system')
  })
}

export function useTheme(): readonly [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState(readTheme)

  const choose = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next)
    applyTheme(next)
    setTheme(next)
  }, [])

  return [theme, choose]
}
