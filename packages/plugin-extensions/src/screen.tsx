import type { Extension } from '@tiny/plugin-host'
import { Button } from '@tiny/ui/components/button'
import { CodeBlock } from '@tiny/ui/components/code-block'
import { Input } from '@tiny/ui/components/input'
import { Loading } from '@tiny/ui/components/loading'
import { Switch } from '@tiny/ui/components/switch'
import { asSchema, type Tool } from 'ai'
import { RotateCwIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'
import {
  newInstall,
  removeInstalled,
  saveInstalled,
  useInstalled,
  type Installed,
} from './installed'
import { useExtensions, type Entry } from './loaded'
import { refuse } from './url'

/** One example, so an empty screen has something to try. */
const EXAMPLE = './extensions/starter.js'

/** `/#/extensions` is the list; a row opens on its own page before it runs. */
export function ExtensionsScreen() {
  return (
    <Routes>
      <Route index element={<ExtensionList />} />
      <Route path="install" element={<Install />} />
      <Route path=":id" element={<Detail />} />
      <Route path="*" element={<Navigate to="/extensions" replace />} />
    </Routes>
  )
}

const add = (url: string, navigate: (to: string) => void) => {
  const one = newInstall(url.trim())
  saveInstalled(one)
  navigate(`/extensions/${one.id}`)
}

function ExtensionList() {
  const installed = useInstalled()
  const { entries } = useExtensions()
  const [url, setUrl] = useState('')
  const navigate = useNavigate()
  const problem = url.trim().length > 0 ? refuse(url) : undefined

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!problem) add(url, (to) => void navigate(to))
        }}
      >
        <div className="flex items-stretch gap-2">
          <Input
            data-testid="ext-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://…/extension.js"
            className="h-control min-w-0 flex-1"
            aria-invalid={problem !== undefined}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button
            type="submit"
            data-testid="ext-add"
            className="h-control px-4"
            disabled={problem !== undefined || url.trim().length === 0}
          >
            Add
          </Button>
        </div>
        {problem && (
          <p className="text-destructive text-sm" data-testid="ext-url-hint">
            {problem}
          </p>
        )}
      </form>

      {installed.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm text-balance">
            An extension is a feature someone else wrote — tools for the model, a screen,
            another model provider. It is fetched and run when you turn it on.
          </p>
          <Button
            type="button"
            variant="outline"
            data-testid="ext-example"
            className="h-control"
            onClick={() => add(EXAMPLE, (to) => void navigate(to))}
          >
            Try the example one
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="ext-list">
          {installed.map((one) => (
            <Row
              key={one.id}
              one={one}
              entry={entries.find((entry) => entry.id === one.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/** What this one is doing, in the fewest words that are still true. */
const say = (one: Installed, entry: Entry | undefined) => {
  if (!one.enabled) return 'Off'
  if (!entry || entry.status === 'loading') return 'Loading…'
  if (entry.status === 'error') return entry.error ?? 'Would not load'
  return summarise(entry.extension)
}

function Row({ one, entry }: { one: Installed; entry: Entry | undefined }) {
  const broken = one.enabled && entry?.status === 'error'

  return (
    <li className="border-line bg-surface rounded-card flex items-center gap-2 border p-3">
      <Link to={one.id} data-testid={`ext-open-${one.id}`} className="min-w-0 flex-1">
        <span className="block truncate font-medium">{one.title}</span>
        <span
          className={`block truncate text-sm ${broken ? 'text-destructive' : 'text-ink-3'}`}
          data-testid={`ext-status-${one.id}`}
        >
          {say(one, entry)}
        </span>
      </Link>
      <Switch
        data-testid={`ext-enabled-${one.id}`}
        checked={one.enabled}
        onCheckedChange={(enabled) => saveInstalled({ ...one, enabled })}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete ${one.title}`}
        data-testid={`ext-delete-${one.id}`}
        onClick={() => removeInstalled(one.id)}
      >
        <Trash2Icon />
      </Button>
    </li>
  )
}

/** An install link. It lands here, off, and you decide. */
function Install() {
  const [params] = useSearchParams()
  const url = params.get('url') ?? ''
  const installed = useInstalled()
  const navigate = useNavigate()
  const problem = refuse(url)
  const already = installed.find((one) => one.url === url)

  if (already) return <Navigate to={`/extensions/${already.id}`} replace />

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h2 className="font-medium">Install an extension?</h2>
      <CodeBlock label="From" code={url || '(nothing)'} />
      {problem ? (
        <p className="text-destructive text-sm" data-testid="ext-url-hint">
          {problem}
        </p>
      ) : (
        <Danger />
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          data-testid="ext-install-confirm"
          className="h-control flex-1"
          disabled={problem !== undefined}
          onClick={() => add(url, (to) => void navigate(to))}
        >
          Add it, switched off
        </Button>
        <Button asChild variant="outline" className="h-control px-4">
          <Link to="/extensions" data-testid="ext-install-cancel">
            No
          </Link>
        </Button>
      </div>
    </div>
  )
}

const Danger = () => (
  <p className="text-ink-2 text-sm text-balance" data-testid="ext-warning">
    This runs inside the app, with everything the app has. It can read your API key and
    every conversation, and it can send them anywhere. Install one the way you install
    anything else that runs on your machine — only from someone you would trust with that.
  </p>
)

const parameters = (schema: Tool['inputSchema']): string => {
  try {
    const json = asSchema(schema).jsonSchema as {
      properties?: Record<string, unknown>
    }
    const names = Object.keys(json.properties ?? {})
    return names.length > 0 ? names.join(', ') : 'nothing'
  } catch {
    return 'nothing we could read'
  }
}

/** A description can be written as a function of the call; only a string is ours to show. */
const describe = ({ description }: Tool): string =>
  typeof description === 'string' && description.length > 0
    ? description.replace(/\.?$/, '.')
    : 'No description.'

/** What it registers, counted, for the row. */
const summarise = (extension: Extension | undefined): string => {
  if (!extension) return 'On'
  const tools = Object.keys(extension.tools ?? {}).length
  const bits = [
    tools > 0 ? `${tools} tool${tools === 1 ? '' : 's'}` : '',
    extension.Screen ? 'a screen' : '',
    Object.keys(extension.providers ?? {}).length > 0 ? 'a provider' : '',
    (extension.actions?.length ?? 0) > 0 ? 'chat actions' : '',
  ].filter(Boolean)
  return bits.length > 0 ? bits.join(' · ') : 'On'
}

function Detail() {
  const { id = '' } = useParams()
  const installed = useInstalled()
  const { entries } = useExtensions()
  const navigate = useNavigate()
  const one = installed.find((other) => other.id === id)

  // Deleted from under us, or a link to something that never existed.
  if (!one) return <Navigate to="/extensions" replace />

  const entry = entries.find((other) => other.id === id)
  const extension = entry?.extension

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium">{one.title}</h2>
          <p className="text-ink-3 truncate text-sm" data-testid="ext-origin">
            {new URL(one.url, location.href).origin}
          </p>
        </div>
        <Switch
          data-testid={`ext-enabled-${one.id}`}
          checked={one.enabled}
          onCheckedChange={(enabled) => saveInstalled({ ...one, enabled })}
        />
      </div>

      <CodeBlock label="From" code={one.url} />

      {one.enabled && !entry && <Loading label="Fetching" />}
      {entry?.status === 'loading' && <Loading label="Fetching" />}
      {entry?.status === 'error' && (
        <p className="text-destructive text-sm" data-testid={`ext-error-${one.id}`}>
          {entry.error}
        </p>
      )}

      {extension && (
        <section className="flex flex-col gap-2" data-testid="ext-registers">
          <h3 className="text-sm font-medium">What it adds</h3>
          <ul className="text-ink-2 flex flex-col gap-1 text-sm">
            {extension.Screen && (
              <li data-testid="ext-screen">
                A screen at <code>/#/{extension.id}</code>
              </li>
            )}
            {Object.entries<Tool>(extension.tools ?? {}).map(([name, tool]) => (
              <li key={name} data-testid={`ext-tool-${name}`}>
                <code>{name}</code> — {describe(tool)} Takes{' '}
                {parameters(tool.inputSchema)}.
              </li>
            ))}
            {Object.entries(extension.providers ?? {}).map(([kind, spec]) => (
              <li key={kind} data-testid={`ext-provider-${kind}`}>
                The {spec.label} provider
              </li>
            ))}
            {(extension.actions ?? []).map(({ label }) => (
              <li key={label} data-testid={`ext-action-${label}`}>
                A “{label}” action on a highlighted reply
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Nothing else shows a system prompt, so this is the only place you'd see it. */}
      {extension?.instructions && (
        <div data-testid="ext-instructions">
          <CodeBlock label="Tells the model" code={extension.instructions} />
        </div>
      )}

      <Danger />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid={`ext-reload-${one.id}`}
          className="h-control flex-1"
          onClick={() => saveInstalled({ ...one, version: one.version + 1 })}
        >
          <RotateCwIcon /> Reload
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-control px-4"
          data-testid={`ext-delete-${one.id}`}
          onClick={() => {
            removeInstalled(one.id)
            void navigate('/extensions')
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  )
}
