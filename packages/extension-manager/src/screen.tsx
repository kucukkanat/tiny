import type { Extension } from '@tiny/host'
import { Button } from '@tiny/ui/components/button'
import { CodeBlock } from '@tiny/ui/components/code-block'
import { ConfirmDelete } from '@tiny/ui/components/confirm-delete'
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
  titleIn,
  useInstalled,
  type Installed,
} from './installed'
import { runningSource, ships, useExtensions, type Entry } from './loaded'
import { MANAGER, setOff, useOff } from './off'
import { prettify } from './pretty'
import { useRichEditor } from './rich'
import { TEMPLATES } from './templates'
import { refuse } from './url'

/** One served next to the app, so an empty screen has something to try. */
const EXAMPLE = './extensions/starter.js'

/** What a row is called until the source in it says what it calls itself. */
const UNTITLED = 'Pasted'

/** `/#/extensions` is the two lists; an installed row opens on its own page first. */
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
        <p className="text-muted-foreground text-sm">Or start one here:</p>
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
          {/* Nothing to start from is the point: it opens the editor empty, so
              what you have on the clipboard is one paste from being installed. */}
          <Button
            type="button"
            variant="outline"
            data-testid="ext-blank"
            className="h-9"
            onClick={() => setFull(add(newSource('', UNTITLED), go) ?? '')}
          >
            Blank
          </Button>
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
            An extension is a feature: tools for the model, a screen, another model
            provider. Three come with this build, below. One you add here is somebody
            else's code, and it does not run until you turn it on.
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
        <section className="flex w-full flex-col gap-2">
          <h2 className="text-sm font-medium">Installed</h2>
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
        </section>
      )}

      <InBuild />
    </div>
  )
}

/**
 * The ones this build brings. Off is a hiding place, not a kill switch — they
 * are still evaluated, so the word is "Hidden" and not the "Off" three inches
 * lower, which means an extension that was never imported at all.
 *
 * No link and no delete: there is no page for one of these, nothing to fetch
 * again and nothing to remove.
 */
function InBuild() {
  const hidden = useOff()

  return (
    <section className="flex w-full max-w-2xl flex-col gap-2" data-testid="ext-built">
      <h2 className="text-sm font-medium">In this build</h2>
      <p className="text-ink-3 text-sm text-balance">
        These are the app. They run with everything it has — your key, your conversations
        — because there is nothing else here to run. Switching one off takes away its
        screen and its place in the sidebar.
      </p>
      <ul className="flex flex-col gap-2">
        {ships().map((one) => (
          <li
            key={one.id}
            className="border-line bg-surface rounded-card flex items-center gap-3 border p-3"
          >
            <div className="min-w-0 flex-1">
              <span className="block truncate font-medium">{one.title}</span>
              <span
                className="text-ink-3 block truncate text-sm"
                data-testid={`ext-built-status-${one.id}`}
              >
                {hidden.has(one.id) ? 'Hidden' : summarise(one)}
              </span>
            </div>
            {one.id === MANAGER ? (
              <span
                className="text-ink-3 shrink-0 px-3 py-2 text-sm"
                data-testid="ext-built-locked"
              >
                Always on
              </span>
            ) : (
              // The only thing to hit on this row, so the target is widened to a
              // thumb rather than leaning on a neighbour the way an installed
              // row's link and delete button do.
              <Switch
                data-testid={`ext-built-${one.id}`}
                aria-label={`Show ${one.title}`}
                className="mr-1 after:-inset-x-4 after:-inset-y-[13px]"
                checked={!hidden.has(one.id)}
                onCheckedChange={(on) => setOff(one.id, !on)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * What a delete actually costs. Nothing here knows where a source came from —
 * a file, a premade, the clipboard — so it says what it does know: the copy the
 * app is holding goes. A linked one only ever held the address.
 */
const loss = (one: Installed) =>
  one.source !== undefined
    ? 'The source goes with it, and nothing here keeps another copy.'
    : 'You would need its URL again to add it back.'

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
      <ConfirmDelete
        name={one.title}
        note={loss(one)}
        onConfirm={() => removeInstalled(one.id)}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete ${one.title}`}
          data-testid={`ext-delete-${one.id}`}
          className="size-11 md:size-8"
        >
          <Trash2Icon />
        </Button>
      </ConfirmDelete>
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

const plural = (count: number, thing: string) =>
  count > 0 ? `${count} ${thing}${count === 1 ? '' : 's'}` : ''

/** What it registers, counted, for the row. */
const summarise = (extension: Extension | undefined): string => {
  if (!extension) return 'On'
  const bits = [
    plural(Object.keys(extension.tools ?? {}).length, 'tool'),
    extension.Screen ? 'a screen' : '',
    plural(Object.keys(extension.providers ?? {}).length, 'provider'),
    (extension.actions?.length ?? 0) > 0 ? 'chat actions' : '',
    (extension.messageActions?.length ?? 0) > 0 ? 'message actions' : '',
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
              <ConfirmDelete
                name={one.title}
                note={loss(one)}
                onConfirm={() => {
                  removeInstalled(one.id)
                  void navigate('/extensions')
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="h-control px-4"
                  data-testid={`ext-delete-${one.id}`}
                >
                  Delete
                </Button>
              </ConfirmDelete>
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
                  {(extension.messageActions ?? []).map(({ label }, index) => (
                    // On the position: unlike the others, nothing stops two of
                    // these sharing a label, and the fold keeps both.
                    <li key={index} data-testid={`ext-message-action-${label}`}>
                      A “{label}” button under a message — <em>runs its own code</em>
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
  // While it is off the text names its own row, which is what lets one you
  // pasted into read right before it has ever run. Once it is on, the module is
  // the authority — otherwise the loader's name and this one take turns on
  // every keystroke. Falling back to the name it has keeps a file called
  // `mine.js` called that until the source says otherwise.
  const save = (source: string) =>
    setFull(
      !saveInstalled({
        ...one,
        source,
        title: (one.enabled ? undefined : titleIn(source)) ?? one.title,
      }),
    )

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
