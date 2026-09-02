import type { Plugin } from '@tiny/plugin-host'
import { SettingsScreen } from './screen'

export const settings: Plugin = {
  id: 'settings',
  title: 'Settings',
  Screen: SettingsScreen,
}

// What another plugin needs to make a model call. The rest stays internal.
export { isUsable, useProvider, type Provider } from './provider'
