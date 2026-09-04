import type { LanguageModel, Tool } from 'ai'
import type { ComponentType } from 'react'

/**
 * The whole contract between the shell and a feature. The shell renders
 * `Screen` under `/#/<id>` — nested routes below that are the plugin's own —
 * and `Sidebar`, if there is one, in the sidebar body.
 *
 * Grow this only when a plugin needs a hook the shell can't already give it.
 */
export type Plugin = {
  readonly id: string
  readonly title: string
  readonly Screen: ComponentType
  /** The plugin's own section of the left sidebar. Chat puts its history here. */
  readonly Sidebar?: ComponentType
}

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

/** A conversation, as an extension sees it: what was said, not how it's stored. */
export type Chat = {
  readonly id: string
  readonly title: string
  readonly updatedAt: number
  /** Everything said in it, both sides, newline-separated. */
  readonly text: string
}

/** Something to offer when a passage of a reply is highlighted. */
export type ChatAction = {
  readonly label: string
  /** Sent with the passage quoted under it. */
  readonly ask: string
}

/**
 * What the app hands an extension. Three things, because everything else an
 * extension needs is already the platform: `localStorage` for its own state,
 * `react-router` to navigate, Tailwind on our tokens to look right.
 */
export type Tiny = {
  /** Every conversation, newest first. Read-only. */
  readonly useChats: () => readonly Chat[]
  /** The configured model, or undefined while there isn't one. */
  readonly useModel: () => LanguageModel | undefined
  /** Puts a question in the chat and waits for the answer. */
  readonly ask: (question: string, options?: readonly string[]) => Promise<string>
}

/**
 * A feature that arrives at runtime instead of in the build. It is a `Plugin`
 * whose `Screen` is optional — a tools-only extension has no screen — plus what
 * it can hand to the rest of the app.
 */
export type Extension = {
  readonly id: string
  readonly title: string
  readonly Screen?: ComponentType
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

/** What an extension module default-exports. */
export type ExtensionModule = (tiny: Tiny) => Extension

export { Safely } from './safely'
export { isExtensionId, isToolName, write } from './storage'
