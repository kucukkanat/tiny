import type { ComponentType } from 'react'

/**
 * The whole contract between the shell and a feature. The shell renders
 * `Screen` under `/#/<id>` — nested routes below that are the plugin's own —
 * and `Sidebar`, if there is one, in the sidebar body.
 *
 * Grow this only when a plugin needs a hook the shell can't already give it.
 */
export type Plugin = {
  readonly id: string
  readonly title: string
  readonly Screen: ComponentType
  /** The plugin's own section of the left sidebar. Chat puts its history here. */
  readonly Sidebar?: ComponentType
}
