import { useEffect, useState } from 'react'

/**
 * Copy something, and say so for a moment. The confirmation is shown rather
 * than hovered into view, because there is no hover on a phone.
 */
export function useCopy(): readonly [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const clear = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(clear)
  }, [copied])

  return [
    copied,
    (text: string) => {
      void navigator.clipboard?.writeText(text)
      setCopied(true)
    },
  ] as const
}
