import { persisted, useStore } from '@tiny/store'

export type ProviderKind = 'openai' | 'anthropic'

/** An OpenAI- or Anthropic-compatible endpoint. `baseUrl` includes the version prefix. */
export type Provider = { kind: ProviderKind; baseUrl: string; apiKey: string }

export const defaultBaseUrl = (kind: ProviderKind) =>
  kind === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1'

/** A provider the user configured: credentials plus the model they picked. */
export type ProviderConfig = Provider & {
  id: string
  label: string
  /** Model ids last fetched from the provider, for the pickers. */
  models: string[]
  model: string
}

export const providers = persisted<{ list: ProviderConfig[]; activeId: string | null }>('tiny.providers', {
  list: [],
  activeId: null,
})

export const useProviders = () => useStore(providers)

export function useActiveProvider(): ProviderConfig | null {
  const { list, activeId } = useProviders()
  return list.find((p) => p.id === activeId) ?? list[0] ?? null
}

export const newProvider = (kind: ProviderKind): ProviderConfig => ({
  id: crypto.randomUUID(),
  label: kind === 'openai' ? 'OpenAI' : 'Anthropic',
  kind,
  baseUrl: defaultBaseUrl(kind),
  apiKey: '',
  models: [],
  model: '',
})

export function saveProvider(next: ProviderConfig) {
  providers.set((s) => ({
    activeId: s.activeId ?? next.id,
    list: s.list.some((p) => p.id === next.id) ? s.list.map((p) => (p.id === next.id ? next : p)) : [...s.list, next],
  }))
}

export function removeProvider(id: string) {
  providers.set((s) => {
    const list = s.list.filter((p) => p.id !== id)
    return { list, activeId: s.activeId === id ? (list[0]?.id ?? null) : s.activeId }
  })
}
