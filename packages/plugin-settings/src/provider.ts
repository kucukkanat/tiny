import { useCallback, useState } from 'react'

export const PROVIDER_KINDS = ['anthropic', 'openai'] as const

export type ProviderKind = (typeof PROVIDER_KINDS)[number]

/** Where the app sends model calls, what dialect it speaks, and as which model. */
export type Provider = {
  readonly kind: ProviderKind
  readonly baseUrl: string
  readonly apiKey: string
  readonly model: string
}

export const DEFAULT_BASE_URL: Readonly<Record<ProviderKind, string>> = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
}

/** Enough to ask the endpoint what it can do. */
export const hasCredentials = (provider: Provider): boolean =>
  provider.apiKey.length > 0 && URL.canParse(provider.baseUrl)

/** Enough to make a model call. */
export const isUsable = (provider: Provider): boolean =>
  hasCredentials(provider) && provider.model.length > 0

// One string per field — nothing to parse, so nothing to fail on.
const storageKey = (field: string) => `tiny.provider.${field}`

export const isProviderKind = (value: unknown): value is ProviderKind =>
  PROVIDER_KINDS.some((kind) => kind === value)

export function readProvider(): Provider {
  const stored = localStorage.getItem(storageKey('kind'))
  const kind = isProviderKind(stored) ? stored : 'anthropic'
  return {
    kind,
    baseUrl: localStorage.getItem(storageKey('baseUrl')) || DEFAULT_BASE_URL[kind],
    apiKey: localStorage.getItem(storageKey('apiKey')) ?? '',
    model: localStorage.getItem(storageKey('model')) ?? '',
  }
}

export function useProvider(): readonly [Provider, (patch: Partial<Provider>) => void] {
  const [provider, setState] = useState(readProvider)

  const update = useCallback((patch: Partial<Provider>) => {
    setState((current) => {
      // A patch changes what it names and nothing else. Switching dialect used
      // to drag the endpoint with it, which threw away a proxy or a local
      // server that speaks both. Clear the field to fall back to the default.
      const next: Provider = { ...current, ...patch }
      // Every field is a string, so the provider itself is the write list.
      for (const [field, value] of Object.entries(next))
        localStorage.setItem(storageKey(field), value)
      return next
    })
  }, [])

  return [provider, update]
}
