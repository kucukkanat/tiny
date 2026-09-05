import type { ExtensionModule } from '@tiny/host'
import { ChatScreen } from './screen'
import { ChatSidebar } from './sidebar'

/** Chat is handed the world and doesn't know who owns any of it. */
export default ((tiny) => ({
  id: 'chat',
  title: 'Chat',
  Screen: () => <ChatScreen tiny={tiny} />,
  Sidebar: ChatSidebar,
})) satisfies ExtensionModule

export { useConversations } from './conversations'
export { textOf } from './model'
