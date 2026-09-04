import type { Plugin } from '@tiny/plugin-host'
import { ChatScreen, type ChatOptions } from './screen'
import { ChatSidebar } from './sidebar'

/** Chat is handed its model and its tools; it doesn't know who owns them. */
export const chat = (options: ChatOptions): Plugin => ({
  id: 'chat',
  title: 'Chat',
  Screen: () => <ChatScreen {...options} />,
  Sidebar: ChatSidebar,
})

export { useConversations } from './conversations'
export { textOf } from './model'
export type { ChatModel, ChatOptions } from './screen'
