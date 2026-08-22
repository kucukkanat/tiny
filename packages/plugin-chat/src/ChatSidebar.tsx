import { useMatch, useNavigate } from 'react-router'
import { IconButton, SidebarRow } from '@tiny/ui'
import { removeChat, useChats } from './chats'

export function ChatSidebar() {
  const chats = useChats()
  const navigate = useNavigate()
  const openId = useMatch('/c/:id')?.params.id

  return (
    <>
      <SidebarRow icon="newChat" label="New chat" onClick={() => navigate('/')} data-testid="chat-new" />
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {chats.length > 0 && <p className="mx-4 mb-1 text-[12.5px] font-medium text-ink-3">Chats</p>}
        {chats.map((chat) => (
          <SidebarRow
            key={chat.id}
            label={chat.title}
            active={chat.id === openId}
            onClick={() => navigate(`/c/${chat.id}`)}
            data-testid={`chat-row-${chat.id}`}
            trailing={
              <IconButton
                icon="trash"
                label={`Delete ${chat.title}`}
                data-testid={`chat-delete-${chat.id}`}
                className="size-8 hover:text-red"
                onClick={() => {
                  removeChat(chat.id)
                  if (chat.id === openId) navigate('/')
                }}
              />
            }
          />
        ))}
      </div>
    </>
  )
}
