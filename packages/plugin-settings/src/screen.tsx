import { Button } from '@tiny/ui/components/button'
import { Input } from '@tiny/ui/components/input'
import { Label } from '@tiny/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tiny/ui/components/select'
import { ToggleGroup, ToggleGroupItem } from '@tiny/ui/components/toggle-group'
import { THEMES, isTheme, useTheme, type Theme } from '@tiny/ui/lib/theme'
import { useState } from 'react'
import { fetchModels } from './models'
import {
  DEFAULT_BASE_URL,
  PROVIDER_KINDS,
  hasCredentials,
  isProviderKind,
  useProvider,
  type Provider,
  type ProviderKind,
} from './provider'

const LABEL: Readonly<Record<ProviderKind, string>> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
}

const THEME_LABEL: Readonly<Record<Theme, string>> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
}

export function SettingsScreen() {
  const [provider, setProvider] = useProvider()
  const [theme, setTheme] = useTheme()
  const [models, setModels] = useState<readonly string[]>([])
  const [modelsError, setModelsError] = useState('')
  const [loading, setLoading] = useState(false)
  const endpointIsBad = provider.baseUrl.length > 0 && !URL.canParse(provider.baseUrl)

  const loadModels = async (from: Provider) => {
    setLoading(true)
    const result = await fetchModels(from)
    setModels(result.ok ? result.models : [])
    setModelsError(result.ok ? '' : result.error)
    setLoading(false)
  }

  return (
    <form className="mx-auto flex w-full max-w-md flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <Label id="api-label">API</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby="api-label"
          value={provider.kind}
          onValueChange={(kind) => {
            if (!isProviderKind(kind)) return
            setProvider({ kind })
            setModels([])
            setModelsError('')
          }}
          className="w-full"
        >
          {PROVIDER_KINDS.map((kind) => (
            <ToggleGroupItem
              key={kind}
              value={kind}
              data-testid={`settings-kind-${kind}`}
              className="h-control flex-1"
            >
              {LABEL[kind]} compatible
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <Label htmlFor="base-url">Endpoint</Label>
        <Input
          id="base-url"
          data-testid="settings-base-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={DEFAULT_BASE_URL[provider.kind]}
          className="h-control"
          aria-invalid={endpointIsBad}
          value={provider.baseUrl}
          onChange={(event) => setProvider({ baseUrl: event.target.value })}
        />
        <p className="text-muted-foreground text-sm" data-testid="settings-base-url-hint">
          {endpointIsBad
            ? 'That is not a URL.'
            : `Any ${LABEL[provider.kind]}-compatible server. Blank uses the default.`}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <Label htmlFor="api-key">API key</Label>
        <Input
          id="api-key"
          data-testid="settings-api-key"
          type="password"
          autoComplete="off"
          placeholder={provider.kind === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
          className="h-control"
          value={provider.apiKey}
          onChange={(event) => setProvider({ apiKey: event.target.value })}
        />
        <p className="text-muted-foreground text-sm">Stored on this device only.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <Label htmlFor="model">Model</Label>
        <div className="flex items-stretch gap-2">
          <Select
            value={provider.model}
            onValueChange={(model) => setProvider({ model })}
            disabled={models.length === 0}
          >
            <SelectTrigger
              id="model"
              data-testid="settings-model"
              // The trigger sizes itself by data-attribute, which outranks a plain
              // `h-*` class — override the variant or it stays 2rem next to a 3rem button.
              className="h-control data-[size=default]:h-control min-w-0 flex-1"
            >
              <SelectValue placeholder={provider.model || 'Load the list first'} />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem
                  key={model}
                  value={model}
                  data-testid={`settings-model-${model}`}
                >
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            data-testid="settings-load-models"
            className="h-control px-4"
            disabled={loading || !hasCredentials(provider)}
            onClick={() => void loadModels(provider)}
          >
            {loading ? 'Loading' : 'Load'}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm" data-testid="settings-model-hint">
          {modelsError ||
            (models.length > 0
              ? `${models.length} models from this endpoint.`
              : 'Load the list to pick a model.')}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <Label id="appearance-label">Appearance</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby="appearance-label"
          value={theme}
          onValueChange={(next) => {
            if (isTheme(next)) setTheme(next)
          }}
          className="w-full"
        >
          {THEMES.map((candidate) => (
            <ToggleGroupItem
              key={candidate}
              value={candidate}
              data-testid={`settings-theme-${candidate}`}
              className="h-control flex-1"
            >
              {THEME_LABEL[candidate]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-muted-foreground text-sm">
          Dark unless you say otherwise. System follows the device.
        </p>
      </fieldset>
    </form>
  )
}
