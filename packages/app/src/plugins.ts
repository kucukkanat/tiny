import type { ComponentType, ReactNode } from 'react'
import { chatPlugin } from '@tiny/plugin-chat'
import { settingsPlugin } from '@tiny/plugin-settings'

/**
 * The whole extension surface. A plugin contributes routes and a slice of the
 * sidebar; the shell contributes nothing else.
 */
export type Plugin = {
  id: string
  routes: { path: string; element: ReactNode }[]
  sidebar?: ComponentType
}

export const plugins: Plugin[] = [chatPlugin, settingsPlugin]
