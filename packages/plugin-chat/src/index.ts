import type { Plugin } from '@tiny/plugin-host'
import { ChatScreen } from './screen'
import { ChatSidebar } from './sidebar'

export const chat: Plugin = {
  id: 'chat',
  title: 'Chat',
  Screen: ChatScreen,
  Sidebar: ChatSidebar,
}
