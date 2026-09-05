import chat, { textOf, useConversations } from '@tiny/extension-chat'
import manager, { useExtensions } from '@tiny/extension-manager'
import settings from '@tiny/extension-settings'
import type { Chat, ExtensionModule, Tiny } from '@tiny/host'
import { askUser, isUsable, useProvider } from '@tiny/host/app'
import type { LanguageModel } from 'ai'
import { useMemo } from 'react'

/** Where model calls go, made into something to call. */
const useModel = (): LanguageModel | undefined => {
  const specs = useExtensions().providers
  const [provider] = useProvider(specs)
  // A fresh client every render is a fresh agent, so only build one on a change.
  // Nothing answers to a dialect whose extension is off — that is not a crash.
  const model = useMemo(() => specs[provider.kind]?.model(provider), [specs, provider])

  return model && isUsable(provider, specs) ? model : undefined
}

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

/**
 * The world an extension is handed: the platform it didn't bring, and the fold
 * of what everyone did. The reads are properties of one cached snapshot, so
 * none of them is a fresh object per render.
 */
export const tiny: Tiny = {
  useChats,
  useModel,
  ask: askUser,
  useTools: () => useExtensions().tools,
  useInstructions: () => useExtensions().instructions,
  useActions: () => useExtensions().actions,
  useProviders: () => useExtensions().providers,
}

/**
 * What ships in this build, in sidebar order. The same type as anything
 * installed, handed the same `tiny` — being listed here is the whole of the
 * difference, and what it buys is imports: one in the build can reach the
 * workspace, one that arrives later gets the five bare specifiers.
 */
export const BUNDLED = [
  chat,
  settings,
  manager,
] as const satisfies readonly ExtensionModule[]
