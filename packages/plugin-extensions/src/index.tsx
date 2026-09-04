import type { Plugin, Tiny } from '@tiny/plugin-host'
import { attach } from './loaded'
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
  return { id: ID, title: 'Extensions', Screen: ExtensionsScreen }
}

export { useExtensions } from './loaded'
