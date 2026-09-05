import {
  isExtensionId,
  isToolName,
  type ChatAction,
  type Extension,
  type ExtensionModule,
  type MessageAction,
  type Registry,
  type Screened,
  type Tiny,
  type Viewed,
} from '@tiny/host'
import { asSchema, dynamicTool } from 'ai'
import { useSyncExternalStore } from 'react'
import {
  readInstalled,
  saveInstalled,
  subscribeInstalled,
  type Installed,
} from './installed'
import { transformJsx } from './jsx'
import { readOff, subscribeOff } from './off'

/** Where one installed extension has got to. */
export type Entry = {
  readonly id: string
  readonly status: 'loading' | 'ready' | 'error'
  readonly error?: string
  readonly extension?: Extension
}

/** Everything the app gets from every extension that is on and working. */
export type Loaded = {
  /** False while anything installed and on is still being fetched. */
  readonly ready: boolean
  /**
   * Where each *installed* one has got to. What ships never loads, so it isn't
   * in here — `extensions` is everything that is live, whatever its origin.
   */
  readonly entries: readonly Entry[]
  /** Every live one, what ships first: the order every fold below ran in. */
  readonly extensions: readonly Extension[]
  readonly screens: readonly Screened[]
  readonly tools: Readonly<Record<string, Viewed>>
  readonly providers: Registry
  readonly actions: readonly ChatAction[]
  readonly messageActions: readonly MessageAction[]
  readonly instructions: string | undefined
}

// A stalled CDN would otherwise leave the shell waiting forever with nothing on
// screen. This can't cancel the fetch — a late answer is still taken.
const TIMEOUT = 10_000

let host: Tiny | undefined
let bundled: readonly Extension[] = []

/** What this build brings, hidden or not. The screen lists all of it. */
export const ships = (): readonly Extension[] => bundled

/**
 * What an extension may reach, and what ships, handed over once at boot by
 * `packages/app/src/app.tsx`.
 *
 * Built one at a time so each sees the ones before it: two of them calling
 * themselves the same thing is a build error here, not a route silently
 * dropped on the floor.
 */
export const attach = (tiny: Tiny, modules: readonly ExtensionModule[]) => {
  host = tiny
  const built: Extension[] = []
  for (const make of modules) built.push(build(make, built))
  bundled = built
  styleShips()
  // A snapshot taken before this would be an app with no routes at all.
  publish()
}

/**
 * Three caches sit between an author and you: the module map, which never
 * re-fetches a URL it has seen; the browser's, which holds a CDN answer for up
 * to a week; and our own service worker's. A counter in the query beats all
 * three, and holding still between reloads is what keeps offline working.
 */
/**
 * A blob per version of a written extension, and the text it was made from.
 *
 * Keyed on the version and not on the text, for two reasons. `sourceOf` is asked
 * on every render, so it has to answer the same thing every time or no entry
 * would ever match its own source and the loader would re-import forever. And
 * importing a module runs it, so text alone must not be the trigger — a half
 * typed loop would freeze the tab. Run bumps the version; that is the trigger.
 */
const blobs = new Map<string, { readonly url: string; readonly source: string }>()

const keyOf = (one: Installed) => `${one.id}\n${one.version}`

/**
 * `sourceOf` runs during render, so a bad tag must not throw out of here. A
 * module that throws on evaluation lands in `load`'s catch instead, which is
 * where every other reason an extension didn't start already shows up.
 */
const compile = (source: string) => {
  try {
    return transformJsx(source)
  } catch (cause) {
    return `throw new SyntaxError(${JSON.stringify(said(cause))})`
  }
}

const blobFor = (one: Installed, source: string) => {
  const key = keyOf(one)
  const made = blobs.get(key)
  if (made) return made.url

  const url = URL.createObjectURL(
    new Blob([compile(source)], { type: 'text/javascript' }),
  )
  // What's remembered is what you wrote, not what ran: the screen compares it
  // against the box to know whether Run is behind.
  blobs.set(key, { url, source })
  return url
}

/** The text that is actually running, which is not always the text on screen. */
export const runningSource = (one: Installed): string | undefined =>
  blobs.get(keyOf(one))?.source

const sourceOf = (one: Installed) => {
  // Written here, so there is nothing to fetch. A blob url dies with the page,
  // which is exactly right: the text is what's stored, and each boot makes a
  // fresh module out of it.
  if (one.source !== undefined) return blobFor(one, one.source)
  if (one.url === undefined) return ''

  // A `data:` URL is its own content — there is nothing between it and you to
  // cache, and a query on the end would land inside the module body.
  if (one.url.startsWith('data:') || one.url.startsWith('blob:')) return one.url

  // Against the page, not against whichever chunk happens to be running this:
  // an address written `./extensions/x.js` means one next to the app.
  const url = new URL(one.url, location.href)
  url.searchParams.set('v', String(one.version))
  return url.href
}

const isExtension = (value: unknown): value is Extension =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string' &&
  'title' in value &&
  typeof value.title === 'string'

/**
 * Every reason to turn one down, said in a sentence you can act on. The names
 * already taken are passed in rather than read off a module: it is the same
 * function for what ships and for what arrives, and only the caller knows what
 * came before.
 */
const build = (make: ExtensionModule, taken: readonly Extension[]): Extension => {
  if (!host) throw new Error('The app is still starting up.')

  const extension: unknown = make(host)
  if (!isExtension(extension)) throw new Error('That has no id and title on it.')
  if (!isExtensionId(extension.id))
    throw new Error(`"${extension.id}" is not a usable id: a-z, 0-9 and dashes.`)
  if (taken.some((one) => one.id === extension.id))
    throw new Error(`"${extension.id}" is a name this build already answers to.`)

  for (const kind of Object.keys(extension.providers ?? {}))
    // A dialect the build ships keeps its name whether or not it is showing.
    // Otherwise hiding Settings would let an installed one answer to
    // `anthropic` and be handed your key.
    if (taken.some((one) => kind in (one.providers ?? {})))
      throw new Error(`"${kind}" is a dialect this build already answers to.`)

  for (const [name, tool] of Object.entries<Viewed>(extension.tools ?? {})) {
    if (!isToolName(name))
      throw new Error(`"${name}" is not a name a model is allowed to call.`)
    // Read the schema now: one the SDK can't convert should be an error here,
    // where it's on screen, and not halfway through answering you.
    void asSchema(tool.inputSchema).jsonSchema
  }
  return extension
}

/** A module that arrived after the build has to prove it is one first. */
const check = (module: unknown): Extension => {
  const make: unknown = (module as { default?: unknown }).default
  if (typeof make !== 'function')
    throw new Error('No default export, or it is not a function of the host.')
  return build(make as ExtensionModule, bundled)
}

const said = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

const load = async (
  one: Installed,
): Promise<Pick<Entry, 'status' | 'error' | 'extension'>> => {
  try {
    // Vite rethrows a failed preload unless a `vite:preloadError` listener
    // cancels it. Never add one — cancelling makes this resolve to undefined.
    const module = await Promise.race([
      import(/* @vite-ignore */ sourceOf(one)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Nothing came back in ten seconds.')), TIMEOUT),
      ),
    ])
    return { status: 'ready', extension: check(module) }
  } catch (cause) {
    return { status: 'error', error: said(cause) }
  }
}

// An extension's styles live as long as it is on. A constructable sheet is
// cheaper than a tag and comes off again cleanly.
const sheets = new Map<string, CSSStyleSheet>()

const unstyle = (id: string) => {
  const sheet = sheets.get(id)
  if (!sheet) return
  sheets.delete(id)
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter((one) => one !== sheet)
}

const style = (id: string, css: string | undefined) => {
  unstyle(id)
  if (!css) return
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css)
  sheets.set(id, sheet)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
}

/**
 * A bundled extension's sheet goes on and off with its switch. Called from
 * `attach` and from the off-store listener, never from `collect` — that runs
 * during render, twice under StrictMode, and adopting a sheet there is a side
 * effect on every unrelated publish.
 */
const styleShips = () => {
  const hidden = readOff()
  for (const one of bundled)
    // Keyed apart because an installed one's key is a storage id, which is the
    // user's, and `style` already unstyles first so this is idempotent.
    style(`bundled:${one.id}`, hidden.has(one.id) ? undefined : one.css)
}

// What has been loaded, and from where — the source is how we tell a reload
// from a render.
const entries = new Map<string, Entry & { readonly source: string }>()
const listeners = new Set<() => void>()

let loaded: Loaded | undefined

/**
 * Written after the build, so the SDK can't know the shape: that is what
 * `dynamicTool` is for, and it renders as one part with the name on it — the
 * same path a tool you wrote yourself takes.
 */
const wrap = (tool: Viewed): Viewed => ({
  ...dynamicTool({
    description: tool.description,
    inputSchema: asSchema(tool.inputSchema),
    execute: async (input, options) => await tool.execute?.(input, options),
  }),
  // The two `dynamicTool` has no field for, carried across by hand. `View`
  // rides on the tool so that whoever won the name won the drawing; and without
  // `toModelOutput`, a payload written to be looked at is also spent in the
  // model's context, in full, on every turn after this one.
  View: tool.View,
  toModelOutput: tool.toModelOutput,
})

/**
 * What we have for this extension *as it is now*. An answer from before it was
 * edited or reloaded is about a different module, and counting it as settled
 * would tell the shell a route exists when it doesn't yet.
 */
const answerFor = (one: Installed) => {
  const entry = entries.get(one.id)
  return entry?.source === sourceOf(one) ? entry : undefined
}

/** A sidebar-only extension still needs something at its route. */
const Nothing = () => null

/**
 * First to claim a name keeps it, and what ships is folded first. A declaration
 * rather than a generic arrow: `<T,>` is a tag to the JSX scanner in `jsx.ts`,
 * and `jsx.test.ts` walks every .ts in the repo to keep it that way.
 */
function first<T>(pairs: readonly (readonly [string, T])[]): Record<string, T> {
  const all: Record<string, T> = {}
  for (const [name, value] of pairs) all[name] ??= value
  return all
}

const collect = (): Loaded => {
  const hidden = readOff()
  const on = readInstalled().filter((one) => one.enabled)
  const rows: readonly Entry[] = on.map(
    (one) => answerFor(one) ?? { id: one.id, status: 'loading' },
  )
  // What ships is already loaded and keeps the names it took, so it goes first.
  const live: readonly Extension[] = [
    ...bundled.filter((one) => !hidden.has(one.id)),
    ...rows.flatMap(({ extension }) => (extension ? [extension] : [])),
  ]
  const instructions = live
    .flatMap(({ instructions: line }) => (line ? [line] : []))
    .join('\n\n')

  return {
    // Nothing bundled has to be fetched; anything installed and on has to
    // answer first, one way or the other.
    ready: on.every((one) => {
      const status = answerFor(one)?.status
      return status === 'ready' || status === 'error'
    }),
    entries: rows,
    extensions: live,
    screens: live.flatMap(({ id, title, Screen, Sidebar }) =>
      Screen || Sidebar ? [{ id, title, Screen: Screen ?? Nothing, Sidebar }] : [],
    ),
    tools: first(
      live.flatMap(({ tools }) =>
        Object.entries<Viewed>(tools ?? {}).map(
          ([name, tool]) => [name, wrap(tool)] as const,
        ),
      ),
    ),
    providers: first(live.flatMap(({ providers }) => Object.entries(providers ?? {}))),
    actions: live.flatMap(({ actions }) => actions ?? []),
    messageActions: live.flatMap(({ messageActions }) => messageActions ?? []),
    instructions: instructions || undefined,
  }
}

const snapshot = (): Loaded => (loaded ??= collect())

const publish = () => {
  loaded = undefined
  for (const listener of listeners) listener()
}

/** Load what is on, forget what isn't. Safe to call as often as you like. */
const sync = (notify = true) => {
  const installed = readInstalled()
  const on = new Set(installed.filter((one) => one.enabled).map((one) => one.id))

  for (const id of [...entries.keys()])
    if (!on.has(id)) {
      entries.delete(id)
      unstyle(id)
    }

  for (const one of installed) {
    // Off first, because `sourceOf` is what mints the blob, and one minted for
    // a row that is off is made from the text as it stood then. A blank one is
    // empty text, so the paste that follows would never be what ran.
    if (!one.enabled) continue
    const source = sourceOf(one)
    if (entries.get(one.id)?.source === source) continue

    entries.set(one.id, { id: one.id, source, status: 'loading' })
    void load(one).then((outcome) => {
      // Edited or turned off while this was in flight: that answer is older.
      if (entries.get(one.id)?.source !== source) return
      entries.set(one.id, { id: one.id, source, ...outcome })
      style(one.id, outcome.extension?.css)

      // Remember what it calls itself, so the row has a name before it loads.
      // Against the row as it is now, not as it was when this started: a blob
      // is keyed on the version, so an edit made while the import was in
      // flight is invisible to the guard above, and writing `one` back would
      // undo it.
      const title = outcome.extension?.title
      const now = readInstalled().find((other) => other.id === one.id)
      if (now && title && title !== now.title) saveInstalled({ ...now, title })
      publish()
    })
  }

  loaded = undefined
  if (notify) publish()
}

let unwatch: (() => void) | undefined

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  if (listeners.size === 1) {
    // Two stores, one teardown: a single variable would drop whichever was
    // assigned first and leak its listener for the life of the document.
    const stop = [
      subscribeInstalled(() => sync()),
      subscribeOff(() => {
        styleShips()
        publish()
      }),
    ]
    unwatch = () => {
      for (const one of stop) one()
    }
    sync(false)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      unwatch?.()
      unwatch = undefined
      // What is loaded stays loaded — the module map holds it either way — but
      // what was made of it is recomputed, so the next watcher sees the store
      // as it is now rather than as it was. The blobs go with it: one already
      // imported stays good in the module map, and the next watcher mints what
      // it needs, so holding them would only grow.
      loaded = undefined
      blobs.clear()
    }
  }
}

/** Everything every enabled extension hands the app. */
export const useExtensions = (): Loaded => useSyncExternalStore(subscribe, snapshot)
