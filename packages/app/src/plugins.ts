import type { Plugin } from '@tiny/plugin-host'
import { chat } from '@tiny/plugin-chat'
import { settings } from '@tiny/plugin-settings'

/** Every feature in the app. Adding one is adding a line here. */
export const plugins = [chat, settings] as const satisfies readonly Plugin[]

/** Where an unknown route lands. */
export const home = `/${plugins[0].id}`
