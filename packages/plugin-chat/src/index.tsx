import { ChatScreen } from './ChatScreen'
import { ChatSidebar } from './ChatSidebar'

export const chatPlugin = {
  id: 'chat',
  routes: [
    { path: '/', element: <ChatScreen /> },
    { path: '/c/:id', element: <ChatScreen /> },
  ],
  sidebar: ChatSidebar,
}
