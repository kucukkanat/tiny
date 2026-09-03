import { chat, type ChatModel } from '@tiny/plugin-chat'
import type { Plugin } from '@tiny/plugin-host'
import {
  isUsable,
  languageModel,
  readModels,
  settings,
  useProvider,
} from '@tiny/plugin-settings'
import { ToolQuestions, tools, useToolSet } from '@tiny/plugin-tools'
import { useMemo } from 'react'
import { Link } from 'react-router'

/** Settings knows where model calls go; chat only needs the model itself. */
const useModel = (): ChatModel | undefined => {
  const [provider, update] = useProvider()
  // Read once: the list only changes on the Settings screen, which isn't this one.
  const names = useMemo(() => readModels(), [])
  // A fresh client every render is a fresh agent, and a fresh connection.
  const model = useMemo(() => languageModel(provider), [provider])

  return isUsable(provider)
    ? { model, name: provider.model, names, select: (next) => update({ model: next }) }
    : undefined
}

/** Chat can't name another plugin's route, so the shell names it here. */
const unconfigured = (
  <p className="text-muted-foreground mx-auto max-w-md py-8 text-center text-balance">
    Pick an endpoint, key and model in{' '}
    <Link
      to={`/${settings.id}`}
      data-testid="chat-to-settings"
      className="text-primary underline"
    >
      {settings.title}
    </Link>{' '}
    first.
  </p>
)

/** Every feature in the app, and every wire between them. */
export const plugins = [
  chat({ useModel, unconfigured, useTools: useToolSet, Panel: ToolQuestions }),
  tools,
  settings,
] as const satisfies readonly Plugin[]

/** Where an unknown route lands. */
export const home = `/${plugins[0].id}`
