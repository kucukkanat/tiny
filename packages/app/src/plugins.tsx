import { chat, textOf, useConversations, type ChatModel } from '@tiny/plugin-chat'
import {
  ToolQuestions,
  askUser,
  extensions,
  useExtensions,
} from '@tiny/plugin-extensions'
import type { Chat, Plugin, Tiny } from '@tiny/plugin-host'
import {
  isUsable,
  providers,
  readModels,
  settings,
  useProvider,
  type Registry,
} from '@tiny/plugin-settings'
import { useMemo } from 'react'
import { Link } from 'react-router'

/** Every dialect on offer: what ships, and whatever extensions brought. */
const useProviders = (): Registry => {
  const { providers: added } = useExtensions()

  // Built-ins first and unshadowed: they lead the list, and an extension cannot
  // quietly answer to a name one of them already has.
  return useMemo(
    () => ({
      ...providers,
      ...Object.fromEntries(
        Object.entries(added).filter(([kind]) => !(kind in providers)),
      ),
    }),
    [added],
  )
}

/** Settings knows where model calls go; chat only needs the model itself. */
const useModel = (): ChatModel | undefined => {
  const specs = useProviders()
  const [provider, update] = useProvider(specs)
  // Read once: the list only changes on the Settings screen, which isn't this one.
  const names = useMemo(() => readModels(), [])
  // A fresh client every render is a fresh agent, so only build one on a change.
  // Nothing answers to a dialect whose extension is off — that is not a crash.
  const model = useMemo(() => specs[provider.kind]?.model(provider), [specs, provider])

  return model && isUsable(provider, specs)
    ? { model, name: provider.model, names, select: (next) => update({ model: next }) }
    : undefined
}

const useTools = () => useExtensions().tools
const useSystem = () => useExtensions().instructions
const useActions = () => useExtensions().actions

/** Conversations as an extension sees them: what was said, not how it's stored. */
const useChats = (): readonly Chat[] => {
  const conversations = useConversations()

  return useMemo(
    () =>
      (conversations ?? []).map(({ id, title, updatedAt, messages }) => ({
        id,
        title,
        updatedAt,
        text: messages
          .map((message) => textOf(message.parts))
          .filter(Boolean)
          .join('\n\n'),
      })),
    [conversations],
  )
}

/** The three things an extension can reach, and nothing else. */
const tiny: Tiny = {
  useChats,
  useModel: () => useModel()?.model,
  ask: askUser,
}

/** Chat can't name another plugin's route, so the shell names it here. */
const unconfigured = (
  <p className="text-muted-foreground mx-auto max-w-md py-8 text-center text-balance">
    Pick an endpoint, key and model in{' '}
    <Link
      to="/settings"
      data-testid="chat-to-settings"
      className="text-primary underline"
    >
      Settings
    </Link>{' '}
    first.
  </p>
)

/** What ships in the build, in sidebar order. */
const BUILT_IN = [
  chat({ useModel, unconfigured, useTools, useSystem, useActions, Panel: ToolQuestions }),
  settings({ useProviders }),
] as const satisfies readonly Plugin[]

/** Every feature in the app, and every wire between them. */
export const plugins = [
  ...BUILT_IN,
  extensions({ tiny, reserved: BUILT_IN.map(({ id }) => id) }),
] as const satisfies readonly Plugin[]

/** Where an unknown route lands. Built-in, so it is always there to land on. */
export const home = `/${plugins[0].id}`

/**
 * The built-ins, then whatever extensions add. `ready` is false while an enabled
 * extension is still being fetched: until then its route doesn't exist yet, and
 * reloading on it would bounce you home before it arrived.
 */
export const usePlugins = (): {
  plugins: readonly Plugin[]
  ready: boolean
} => {
  const { screens, ready } = useExtensions()

  return { plugins: useMemo(() => [...plugins, ...screens], [screens]), ready }
}
