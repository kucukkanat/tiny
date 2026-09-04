import type { Plugin } from '@tiny/plugin-host'
import { SettingsScreen, type SettingsOptions } from './screen'

/** Settings is handed the dialects on offer; it doesn't own the list. */
export const settings = (options: SettingsOptions): Plugin => ({
  id: 'settings',
  title: 'Settings',
  Screen: () => <SettingsScreen {...options} />,
})

// What the app needs to hand a model to another plugin. The rest stays internal.
export { providers } from './providers'
export {
  isUsable,
  readModels,
  readProvider,
  useProvider,
  type Registry,
} from './provider'
export type { SettingsOptions } from './screen'
