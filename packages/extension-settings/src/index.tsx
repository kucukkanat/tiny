import type { ExtensionModule } from '@tiny/host'
import { providers } from './providers'
import { SettingsScreen } from './screen'

/**
 * Settings offers every dialect on the toggle and contributes the two that
 * ship, through the same slot an extension uses.
 */
export default ((tiny) => ({
  id: 'settings',
  title: 'Settings',
  Screen: () => <SettingsScreen useProviders={tiny.useProviders} />,
  providers,
})) satisfies ExtensionModule
