import type { Extension } from '@tiny/plugin-host'
import { Button } from '@tiny/ui/components/button'
import { CodeBlock } from '@tiny/ui/components/code-block'
import { Input } from '@tiny/ui/components/input'
import { Loading } from '@tiny/ui/components/loading'
import { Switch } from '@tiny/ui/components/switch'
import { Textarea } from '@tiny/ui/components/textarea'
import { asSchema, type Tool } from 'ai'
import { PlayIcon, RotateCwIcon, Trash2Icon, WandSparklesIcon } from 'lucide-react'
import type { PrismEditor } from 'prism-code-editor'
import { useRef, useState } from 'react'
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
  newSource,
  removeInstalled,
  saveInstalled,
  useInstalled,
  type Installed,
} from './installed'
import { runningSource, useExtensions, type Entry } from './loaded'
import { prettify } from './pretty'
import { useRichEditor } from './rich'
import { TEMPLATES } from './templates'
import { refuse } from './url'

/** One that ships with the app, so an empty screen has something to try. */
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

/** Saved and opened, or a reason it couldn't be saved. */
const add = (one: Installed, go: (to: string) => void): string | undefined => {
  if (!saveInstalled(one)) return 'There is no room left in storage for this.'
  go(`/extensions/${one.id}`)
  return undefined
}

function ExtensionList() {
  const installed = useInstalled()
  const { entries } = useExtensions()
  const [url, setUrl] = useState('')
  const [full, setFull] = useState('')
  const navigate = useNavigate()
  const go = (to: string) => void navigate(to)
  const problem = url.trim().length > 0 ? refuse(url) : undefined

  return (
    <div className="@container mx-auto flex w-full max-w-5xl flex-col gap-5">
      <form
        className="flex w-full max-w-2xl flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!problem) setFull(add(newInstall(url.trim()), go) ?? '')
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
        {(problem ?? full) && (
          <p className="text-destructive text-sm" data-testid="ext-url-hint">
            {problem ?? full}
          </p>
        )}
      </form>

      <div className="flex w-full max-w-2xl flex-col gap-2">
        <p className="text-muted-foreground text-sm">Or open one you have written:</p>
        <div className="flex flex-wrap gap-2">
          {/* A label is the only way to make a file input look like anything. */}
          <label
            className="border-line rounded-control hover:bg-hover flex h-9 cursor-pointer items-center border px-3 text-sm"
            data-testid="ext-file-label"
          >
            Pick a file
            <input
              type="file"
              data-testid="ext-file"
              // iOS matches `accept` against types it knows, and greys out the
              // rest — a list this broad is what keeps a .js file pickable.
              accept=".js,.mjs,.txt,text/javascript,text/plain"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                // Reset, or choosing the same file twice is silence.
                event.target.value = ''
                if (file) setFull(add(newSource(await file.text(), file.name), go) ?? '')
              }}
            />
          </label>
          {TEMPLATES.map(({ label, title, source }) => (
            <Button
              key={label}
              type="button"
              variant="outline"
              data-testid={`ext-template-${label.toLowerCase().replace(' ', '-')}`}
              className="h-9"
              onClick={() => setFull(add(newSource(source, title), go) ?? '')}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {installed.length === 0 ? (
        <div className="flex w-full max-w-2xl flex-col gap-3">
          <p className="text-muted-foreground text-sm text-balance">
            An extension is a feature someone else wrote, or one you write here — tools
            for the model, a screen, another model provider. It is run when you turn it
            on.
          </p>
          <Button
            type="button"
            variant="outline"
            data-testid="ext-example"
            className="h-control"
            onClick={() => setFull(add(newInstall(EXAMPLE), go) ?? '')}
          >
            Try the example one
          </Button>
        </div>
      ) : (
        <ul
          className="grid gap-2 @2xl:grid-cols-2 @4xl:grid-cols-3"
          data-testid="ext-list"
        >
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
    <li className="border-line bg-surface rounded-card flex items-center gap-3 border p-3">
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
        className="size-11 md:size-8"
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
  const already = installed.find((one) => one.url !== undefined && one.url === url)

  if (already) return <Navigate to={`/extensions/${already.id}`} replace />

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
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
          onClick={() => add(newInstall(url), (to) => void navigate(to))}
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
  const written = one.source !== undefined
  // What is running is the text the current version was made from, which is not
  // always the text on screen.
  const stale = written && one.enabled && runningSource(one) !== one.source

  // The tool set is one object, so a shared name is a quiet overwrite rather
  // than an error. Name it here, where it can be acted on.
  const elsewhere = new Set(
    entries
      .filter((other) => other.id !== id)
      .flatMap((other) => Object.keys(other.extension?.tools ?? {})),
  )

  // The container sits outside the cap it controls: measured inside it, it would
  // only ever report the capped width and the wide layout would never come.
  return (
    <div className="@container w-full">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 @6xl:max-w-6xl">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-medium">{one.title}</h2>
            <p className="text-ink-3 truncate text-sm" data-testid="ext-origin">
              {written ? 'Written here' : new URL(one.url ?? '', location.href).origin}
            </p>
          </div>
          <Switch
            data-testid={`ext-enabled-${one.id}`}
            checked={one.enabled}
            onCheckedChange={(enabled) => saveInstalled({ ...one, enabled })}
          />
        </div>

        {/* A grid item is min-width:auto by default, so without min-w-0 the
            editor widens its own track and lands on the column beside it. */}
        <div className="grid items-start gap-5 @6xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            {written ? (
              <Editor one={one} stale={stale} />
            ) : (
              <CodeBlock label="From" code={one.url ?? ''} />
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant={stale ? 'default' : 'outline'}
                data-testid={`ext-reload-${one.id}`}
                className="h-control flex-1"
                onClick={() => saveInstalled({ ...one, version: one.version + 1 })}
              >
                {written ? <PlayIcon /> : <RotateCwIcon />}
                {written ? 'Run' : 'Reload'}
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

          <div className="flex min-w-0 flex-col gap-5">
            {one.enabled && (!entry || entry.status === 'loading') && (
              <Loading label="Starting" />
            )}
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
                      {elsewhere.has(name) && (
                        <span
                          className="text-orange"
                          data-testid={`ext-tool-clash-${name}`}
                        >
                          {' '}
                          Another extension answers to this name too.
                        </span>
                      )}
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
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Every keystroke is saved, so a reload doesn't cost you what you typed — but
 * nothing runs until you say so. Importing a module executes it, and a loop you
 * are halfway through writing would take the tab with it.
 */
function Editor({ one, stale }: { one: Installed; stale: boolean }) {
  const [full, setFull] = useState(false)
  const [problem, setProblem] = useState<string>()
  const [formatting, setFormatting] = useState(false)
  const rich = useRef<PrismEditor>(null)
  const loaded = useRichEditor()
  const save = (source: string) => setFull(!saveInstalled({ ...one, source }))

  const format = async () => {
    setFormatting(true)
    try {
      const next = await prettify(one.source ?? '')
      const box = rich.current?.textarea
      // Through the textarea, not `setOptions`: an input event is what the
      // highlighting, the undo history and `save` are all already listening for.
      if (box) {
        box.setRangeText(next, 0, box.value.length, 'end')
        box.dispatchEvent(new Event('input', { bubbles: true }))
      } else save(next)
      setProblem(undefined)
    } catch (error) {
      // Prettier's message is a sentence and then a code frame; the sentence is
      // the part that fits on a line.
      setProblem(
        error instanceof Error ? error.message.split('\n')[0] : 'Would not format.',
      )
    }
    setFormatting(false)
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      {/* The plain box is what's here until the editor arrives, and what stays
          if it never does — offline on a first visit, say. Same testid either
          way: it is a real textarea underneath the colour. */}
      {loaded ? (
        <loaded.RichEditor
          key={one.id}
          value={one.source ?? ''}
          onChange={save}
          onReady={(made) => {
            rich.current = made
          }}
        />
      ) : (
        <Textarea
          data-testid="ext-source"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          className="max-h-[60svh] min-h-48 font-mono"
          value={one.source ?? ''}
          onChange={(event) => save(event.target.value)}
        />
      )}
      <div className="flex items-start gap-2">
        <p
          className={`flex-1 text-sm ${problem ? 'text-destructive' : 'text-muted-foreground'}`}
          data-testid="ext-source-hint"
        >
          {problem ??
            (full
              ? 'There is no room left in storage, so this is not saved.'
              : stale
                ? 'Edited. Press Run to use it.'
                : 'JSX works. Only these can be imported: react, react/jsx-runtime, react-router, zod, ai.')}
        </p>
        <Button
          type="button"
          variant="ghost"
          data-testid="ext-prettify"
          className="h-11 shrink-0 px-3 md:h-8"
          disabled={formatting}
          onClick={() => void format()}
        >
          <WandSparklesIcon />
          Prettify
        </Button>
      </div>
    </fieldset>
  )
}
