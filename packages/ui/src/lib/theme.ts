import { useCallback, useEffect, useState } from 'react'

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

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

/** Every token hangs off `.dark`, so flipping that one class is the whole job. */
export const applyTheme = (theme: Theme): void => {
  const dark = theme === 'system' ? prefersDark() : theme === 'dark'
  document.documentElement.classList.toggle('dark', dark)
}

export function useTheme(): readonly [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState(readTheme)

  const choose = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next)
    applyTheme(next)
    setTheme(next)
  }, [])

  // On `system` the OS can change out from under an open tab.
  useEffect(() => {
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => applyTheme('system')
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [theme])

  return [theme, choose]
}
