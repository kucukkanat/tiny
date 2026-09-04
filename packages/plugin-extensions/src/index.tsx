import type { Plugin, Tiny } from '@tiny/plugin-host'
import { attach } from './loaded'
import { migrateTools } from './migrate'
import { ExtensionsScreen } from './screen'

export type ExtensionsOptions = {
  /** What an extension is allowed to reach. */
  readonly tiny: Tiny
  /** Ids the app already answers to, which an extension may not take. */
  readonly reserved: readonly string[]
}

/** Extensions are handed what they may reach; this plugin owns none of it. */
const ID = 'extensions'

export const extensions = ({ tiny, reserved }: ExtensionsOptions): Plugin => {
  attach(tiny, [...reserved, ID])
  // Tools used to be their own screen. Whatever is left from that becomes an
  // extension here, once, and the old keys go.
  migrateTools()
  return { id: ID, title: 'Extensions', Screen: ExtensionsScreen }
}

// The question an extension's tool asks with, and where the answer is given.
// Chat renders the card without knowing extensions exist.
export { askUser } from './ask'
export { ToolQuestions } from './questions'
export { useExtensions } from './loaded'
