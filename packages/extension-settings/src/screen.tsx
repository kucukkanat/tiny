import { Button } from '@tiny/ui/components/button'
import { Input } from '@tiny/ui/components/input'
import { Loading } from '@tiny/ui/components/loading'
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
import type { Provider, Registry } from '@tiny/host'
import { useState } from 'react'
import { hasCredentials, readModels, useProvider, writeModels } from '@tiny/host/app'

/** Settings is handed the dialects on offer; it doesn't know where they came from. */
export type SettingsOptions = {
  readonly useProviders: () => Registry
}

/**
 * Grouped surfaces rather than one long column, capped where a text field stops
 * getting more readable — the longest endpoint anyone writes is about 440px, and
 * width past that is whitespace inside the box.
 */
const card =
  'bg-surface shadow-card rounded-card mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 @md:p-6'

/**
 * Label beside its control once there is room for both, stacked below that.
 * Measured against the form, not the window: the sidebar takes 16rem the moment
 * the window passes 768px, so the room here actually *shrinks* as the window
 * grows, and a `md:` breakpoint would go two-column at the narrowest point.
 */
const row =
  'grid gap-2 @2xl:grid-cols-[8rem_minmax(0,1fr)] @2xl:items-baseline @2xl:gap-x-6'

const hint = 'text-muted-foreground text-sm @2xl:col-start-2'

const THEME_LABEL: Readonly<Record<Theme, string>> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
}

export function SettingsScreen({ useProviders }: SettingsOptions) {
  // oxlint-disable-next-line react/hooks -- bound once, in the app
  const specs = useProviders()
  const [provider, setProvider] = useProvider(specs)
  const [theme, setTheme] = useTheme()
  const [models, setModels] = useState(readModels)
  const [modelsError, setModelsError] = useState('')
  const [loading, setLoading] = useState(false)

  const spec = specs[provider.kind]
  const endpointIsBad = provider.baseUrl.length > 0 && !URL.canParse(provider.baseUrl)

  // A loaded list describes the endpoint it came from, so touching the endpoint,
  // the key or the dialect throws it away. Picking a model doesn't.
  const change = (patch: Partial<Provider>) => {
    setProvider(patch)
    setModels([])
    writeModels([])
    setModelsError('')
  }

  const loadModels = async (from: Provider) => {
    if (!spec) return
    setLoading(true)
    const result = await spec.models(from).then(
      (list) => ({ models: list, error: '' }),
      (cause: unknown) => ({
        models: [],
        error: cause instanceof Error ? cause.message : String(cause),
      }),
    )
    setModels([...result.models])
    writeModels(result.models)
    setModelsError(result.error)
    setLoading(false)
  }

  return (
    <form className="@container flex flex-col gap-4 @2xl:py-2">
      <div className={card}>
        <fieldset className={row}>
          <Label id="api-label">API</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-labelledby="api-label"
            value={provider.kind}
            onValueChange={(kind) => {
              if (specs[kind]) change({ kind })
            }}
            className="w-full"
          >
            {Object.entries(specs).map(([kind, { label }]) => (
              <ToggleGroupItem
                key={kind}
                value={kind}
                data-testid={`settings-kind-${kind}`}
                className="h-control flex-1"
              >
                {label} compatible
              </ToggleGroupItem>
            ))}
            {/* What you chose is still what you chose, even with nothing to run it. */}
            {!spec && (
              <ToggleGroupItem
                value={provider.kind}
                disabled
                data-testid={`settings-kind-${provider.kind}`}
                className="h-control flex-1"
              >
                {provider.kind} (not loaded)
              </ToggleGroupItem>
            )}
          </ToggleGroup>
        </fieldset>

        <fieldset className={row}>
          <Label htmlFor="base-url">Endpoint</Label>
          <Input
            id="base-url"
            data-testid="settings-base-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={spec?.baseUrl}
            className="h-control"
            aria-invalid={endpointIsBad}
            value={provider.baseUrl}
            onChange={(event) => change({ baseUrl: event.target.value })}
          />
          <p className={hint} data-testid="settings-base-url-hint">
            {endpointIsBad
              ? 'That is not a URL.'
              : spec
                ? `Any ${spec.label}-compatible server. Blank uses the default.`
                : `Nothing here answers to ${provider.kind}. Its extension is off or still loading.`}
          </p>
        </fieldset>

        <fieldset className={row}>
          <Label htmlFor="api-key">API key</Label>
          <Input
            id="api-key"
            data-testid="settings-api-key"
            type="password"
            autoComplete="off"
            placeholder={provider.kind === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
            className="h-control"
            value={provider.apiKey}
            onChange={(event) => change({ apiKey: event.target.value })}
          />
          <p className={hint}>Stored on this device only.</p>
        </fieldset>

        <fieldset className={row}>
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
              disabled={loading || !spec || !hasCredentials(provider)}
              onClick={() => void loadModels(provider)}
            >
              Load
            </Button>
          </div>
          {loading ? (
            <Loading
              label="Asking the endpoint"
              data-testid="settings-loading"
              className="@2xl:col-start-2"
            />
          ) : (
            <p className={hint} data-testid="settings-model-hint">
              {modelsError ||
                (models.length > 0
                  ? `${models.length} models from this endpoint.`
                  : 'Load the list to pick a model.')}
            </p>
          )}
        </fieldset>
      </div>

      <div className={card}>
        <fieldset className={row}>
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
          <p className={hint}>
            Dark unless you say otherwise. System follows the device.
          </p>
        </fieldset>
      </div>
    </form>
  )
}
