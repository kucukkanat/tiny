import { useState } from 'react'
import {
  defaultBaseUrl,
  listModels,
  removeProvider,
  saveProvider,
  type ProviderConfig,
  type ProviderKind,
} from '@tiny/llm'
import { Button, Field, IconButton, Input, Select } from '@tiny/ui'

export function ProviderCard({ provider, active, onActivate }: { provider: ProviderConfig; active: boolean; onActivate(): void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const edit = (patch: Partial<ProviderConfig>) => saveProvider({ ...provider, ...patch })

  async function fetchModels() {
    setLoading(true)
    setError('')
    try {
      const models = await listModels(provider)
      edit({ models, model: models.includes(provider.model) ? provider.model : (models[0] ?? '') })
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4" data-testid={`provider-${provider.id}`}>
      <div className="flex items-center gap-2">
        <input
          value={provider.label}
          aria-label="Provider name"
          data-testid={`provider-label-${provider.id}`}
          onChange={(e) => edit({ label: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none"
        />
        {active ? (
          <span className="rounded-full bg-accent-tint px-2 py-1 text-[12px] font-medium text-accent">Active</span>
        ) : (
          <Button data-testid={`provider-use-${provider.id}`} onClick={onActivate}>
            Use
          </Button>
        )}
        <IconButton
          icon="trash"
          label={`Delete ${provider.label}`}
          data-testid={`provider-delete-${provider.id}`}
          className="hover:text-red"
          onClick={() => removeProvider(provider.id)}
        />
      </div>

      <Field label="API style">
        <Select
          value={provider.kind}
          data-testid={`provider-kind-${provider.id}`}
          onChange={(e) => {
            const kind = e.target.value as ProviderKind
            const wasDefault = provider.baseUrl === defaultBaseUrl(provider.kind)
            edit({ kind, models: [], model: '', baseUrl: wasDefault ? defaultBaseUrl(kind) : provider.baseUrl })
          }}
        >
          <option value="openai">OpenAI compatible</option>
          <option value="anthropic">Anthropic compatible</option>
        </Select>
      </Field>

      <Field label="Base URL" hint="Include the version prefix, e.g. https://api.openai.com/v1">
        <Input
          value={provider.baseUrl}
          inputMode="url"
          data-testid={`provider-baseurl-${provider.id}`}
          onChange={(e) => edit({ baseUrl: e.target.value })}
        />
      </Field>

      <Field label="API key" hint="Kept in this browser only — it never leaves the device except to the provider.">
        <Input
          value={provider.apiKey}
          type="password"
          placeholder="sk-…"
          data-testid={`provider-key-${provider.id}`}
          onChange={(e) => edit({ apiKey: e.target.value })}
        />
      </Field>

      <Field label="Model">
        <div className="flex gap-2">
          <Select
            value={provider.model}
            disabled={provider.models.length === 0}
            data-testid={`provider-model-${provider.id}`}
            onChange={(e) => edit({ model: e.target.value })}
          >
            {provider.models.length === 0 && <option value="">Load models first</option>}
            {provider.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Button
            className="shrink-0"
            disabled={loading || !provider.apiKey}
            data-testid={`provider-models-${provider.id}`}
            onClick={fetchModels}
          >
            {loading ? 'Loading…' : 'Load models'}
          </Button>
        </div>
      </Field>

      {error && (
        <p className="rounded-card bg-red-tint px-3 py-2 text-[13px] text-red" data-testid={`provider-error-${provider.id}`}>
          {error}
        </p>
      )}
    </section>
  )
}
