import type { Plugin } from '@tiny/plugin-host'
import { SettingsScreen } from './screen'

export const settings: Plugin = {
  id: 'settings',
  title: 'Settings',
  Screen: SettingsScreen,
}

// What the app needs to hand a model to another plugin. The rest stays internal.
export { languageModel } from './models'
export { isUsable, readModels, useProvider, type Provider } from './provider'
