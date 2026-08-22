import { newProvider, providers, saveProvider, useProviders } from '@tiny/llm'
import { Button } from '@tiny/ui'
import { ProviderCard } from './ProviderCard'

export function SettingsScreen() {
  const { list, activeId } = useProviders()
  const active = list.find((p) => p.id === activeId)?.id ?? list[0]?.id

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-6 sm:px-8">
      <header>
        <h1 className="text-[20px] font-medium tracking-[-0.01em] text-ink">Providers</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Point the app at any OpenAI- or Anthropic-compatible endpoint. Keys stay in this browser.
        </p>
      </header>

      {list.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          active={provider.id === active}
          onActivate={() => providers.set((s) => ({ ...s, activeId: provider.id }))}
        />
      ))}

      <Button variant="primary" className="self-start" data-testid="provider-add" onClick={() => saveProvider(newProvider('openai'))}>
        Add provider
      </Button>
    </div>
  )
}
