import type { LanguageModel, Tool, ToolSet } from 'ai'
import type { ComponentType } from 'react'

/** Where the app sends model calls, what dialect it speaks, and as which model. */
export type Provider = {
  readonly kind: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly model: string
}

/**
 * A model API the app can talk to. Settings offers one row per spec, and an
 * extension can add its own.
 */
export type ProviderSpec = {
  readonly label: string
  /** Where calls go when the endpoint field is left blank. */
  readonly baseUrl: string
  readonly model: (provider: Provider) => LanguageModel
  /** What this endpoint serves. Throw with a readable message and it's shown. */
  readonly models: (provider: Provider) => Promise<readonly string[]>
}

/** Every dialect the app can speak, whoever brought it. */
export type Registry = Readonly<Record<string, ProviderSpec>>

/** A conversation, as an extension sees it: what was said, not how it's stored. */
export type Chat = {
  readonly id: string
  readonly title: string
  readonly updatedAt: number
  /** Everything said in it, both sides, a blank line between. */
  readonly text: string
}

/** Something to offer when a passage of a reply is highlighted. */
export type ChatAction = {
  readonly label: string
  /** Sent with the passage quoted under it. */
  readonly ask: string
}

/**
 * What the app hands an extension: the platform it didn't bring, and the fold of
 * what every extension did. Everything else is already there — `localStorage`
 * for its own state, `react-router` to navigate, Tailwind on our tokens.
 *
 * This type only ever grows. A module sitting in someone's storage binds to the
 * shape it was written against and there is no migration that reaches it, so
 * `useModel` returns a `LanguageModel` and always will. Three of the reads below
 * exist for the chat that ships in this build, and are frozen by the same rule.
 */
export type Tiny = {
  /** Every conversation, newest first. Read-only. */
  readonly useChats: () => readonly Chat[]
  /** The configured model, or undefined while there isn't one. */
  readonly useModel: () => LanguageModel | undefined
  /** Puts a question in the chat and waits for the answer. */
  readonly ask: (question: string, options?: readonly string[]) => Promise<string>
  /** Every tool the model may call, yours included, ready for the SDK. */
  readonly useTools: () => ToolSet
  /** Every extension's `instructions`, joined, as the system prompt gets them. */
  readonly useInstructions: () => string | undefined
  /** Every action offered when a passage of a reply is highlighted. */
  readonly useActions: () => readonly ChatAction[]
  /** Every dialect on offer, whoever brought it. */
  readonly useProviders: () => Registry
}

/**
 * A feature. `Screen` renders under `/#/<id>` — nested routes below that are its
 * own — `Sidebar`, if there is one, in the sidebar body, and the rest is folded
 * in with what every other extension registered.
 *
 * One type however it arrives: `packages/app/src/extensions.tsx` lists the ones
 * that ship in the build, and anything else is `import()`ed in the tab. Grow it
 * only when a feature needs a hook the shell can't already give it.
 */
export type Extension = {
  readonly id: string
  readonly title: string
  readonly Screen?: ComponentType
  /** Its own section of the left sidebar. Chat puts its history here. */
  readonly Sidebar?: ComponentType
  /** Written with the SDK's `tool()`, so the model sees your `inputSchema`. */
  readonly tools?: Readonly<Record<string, Tool>>
  readonly providers?: Readonly<Record<string, ProviderSpec>>
  readonly actions?: readonly ChatAction[]
  /** Added to the model's system prompt. Shown to the user before they enable it. */
  readonly instructions?: string
  /** Adopted as a stylesheet while this is on. See the README. */
  readonly css?: string
}

/** One with somewhere to go. What the shell routes, under `/#/<id>`. */
export type Screened = Extension & { readonly Screen: ComponentType }

/** What every extension is, however it arrives. */
export type ExtensionModule = (tiny: Tiny) => Extension

export { Safely } from './safely'
export { isExtensionId, isToolName, write } from './storage'
