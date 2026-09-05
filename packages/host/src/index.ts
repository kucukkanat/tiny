import type { LanguageModel, Tool } from 'ai'
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

/** One message, as an extension sees it: what was said, not how it's stored. */
export type Message = {
  readonly id: string
  readonly role: 'user' | 'assistant'
  /** Everything it said out loud, with tool calls and reasoning left out. */
  readonly text: string
}

/** The conversation an action was pressed in, and the one way to add to it. */
export type Thread = {
  readonly id: string
  readonly title: string
  /** The model name showing in the picker, not the object behind it. */
  readonly model: string
  /** Everything in it, oldest first, the message you were handed included. */
  readonly messages: readonly Message[]
  /** Say something, as you. Once per press, and never while one is arriving. */
  readonly send: (text: string) => void
}

/**
 * An icon this build already ships, so naming one costs nothing. Anything else
 * is a component of your own — which is why the slot takes both.
 */
export type IconName =
  'add' | 'check' | 'copy' | 'play' | 'retry' | 'stop' | 'trash' | 'wand'

/**
 * Something to offer in the footer of a message, beside Copy.
 *
 * Unlike a `ChatAction`, which can only ask, this runs your code — so it can
 * copy something else, keep it, post it somewhere, or say something back
 * through `thread.send`.
 */
export type MessageAction = {
  readonly label: string
  /**
   * One of the names above, a component of your own, or any other string,
   * which is drawn as it is — an emoji works. The label is what a screen
   * reader gets either way.
   */
  readonly icon?: IconName | ComponentType | (string & {})
  /** Which messages it belongs on. On all of them when there isn't one. */
  readonly when?: (message: Message) => boolean
  /** Pressed. The button is disabled while a promise you return is pending. */
  readonly run: (message: Message, thread: Thread) => void | Promise<void>
}

/**
 * Draws one call's result in the reply, in place of its JSON. Called only once
 * the output is there, so there is no half-arrived state to handle: while the
 * call is still out, or if it failed, chat draws its own row as it always did.
 *
 * Both props are `unknown` because both have been through storage and back. You
 * wrote the tool, so you know the shape — `zod` is on the import map to check
 * it, and what you draw is on our tokens: `var(--brand)`, `var(--ink-2)`.
 *
 * Frozen at two props, and by omission at one moment. There is no loading
 * state, no progress and no preview of half-written arguments, because a new
 * prop on a shape a stored module already binds to is what this rules out. If
 * that turns out to matter it is a second slot, not a wider one.
 */
export type ToolView = ComponentType<{
  /** What the model asked for. */
  readonly input: unknown
  /** What your `execute` returned. */
  readonly output: unknown
}>

/**
 * A tool, and what draws its result. Keyed to the tool by being on it rather
 * than by name in a second place — so whichever extension won the name won the
 * drawing with it, and there is no other list that can disagree with this one.
 */
export type Viewed = Tool & { readonly View?: ToolView }

/**
 * What the app hands an extension: the platform it didn't bring, and the fold of
 * what every extension did. Everything else is already there — `localStorage`
 * for its own state, `react-router` to navigate, Tailwind on our tokens.
 *
 * This type only ever grows. A module sitting in someone's storage binds to the
 * shape it was written against and there is no migration that reaches it, so
 * `useModel` returns a `LanguageModel` and always will. Four of the reads below
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
  readonly useTools: () => Readonly<Record<string, Viewed>>
  /** Every extension's `instructions`, joined, as the system prompt gets them. */
  readonly useInstructions: () => string | undefined
  /** Every action offered when a passage of a reply is highlighted. */
  readonly useActions: () => readonly ChatAction[]
  /** Every action offered in the footer of a message. */
  readonly useMessageActions: () => readonly MessageAction[]
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
  /**
   * Written with the SDK's `tool()`, so the model sees your `inputSchema`. Hang
   * a `View` on one and it draws its own result in the reply.
   */
  readonly tools?: Readonly<Record<string, Viewed>>
  readonly providers?: Readonly<Record<string, ProviderSpec>>
  readonly actions?: readonly ChatAction[]
  /** Offered in the footer of a message, beside Copy. */
  readonly messageActions?: readonly MessageAction[]
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
