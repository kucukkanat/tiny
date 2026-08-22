import type { Plugin } from '@tiny/plugin-host'
import { SettingsScreen } from './screen'

export const settings: Plugin = {
  id: 'settings',
  title: 'Settings',
  Screen: SettingsScreen,
}

export { fetchModels, type ModelsResult } from './models'
export {
  DEFAULT_BASE_URL,
  PROVIDER_KINDS,
  hasCredentials,
  isProviderKind,
  isUsable,
  readProvider,
  useProvider,
  type Provider,
  type ProviderKind,
} from './provider'
