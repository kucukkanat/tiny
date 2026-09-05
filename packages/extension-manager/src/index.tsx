import type { ExtensionModule } from '@tiny/host'
import { ExtensionsScreen } from './screen'

/** The screen that installs, lists and edits the ones that arrive at runtime. */
export default (() => ({
  id: 'extensions',
  title: 'Extensions',
  Screen: ExtensionsScreen,
})) satisfies ExtensionModule

// The registry, for the shell. `ships`, `useOff` and the rest are this package's
// own business, and its screen is what reads them.
export { attach, useExtensions } from './loaded'
export { migrateTools } from './migrate'
