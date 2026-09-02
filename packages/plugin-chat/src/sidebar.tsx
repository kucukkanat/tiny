import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@tiny/ui/components/sidebar'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
  chatPath,
  newChatPath,
  removeConversation,
  useConversations,
} from './conversations'

/** Every conversation you've had, newest first, plus a way to start another. */
export function ChatSidebar() {
  const conversations = useConversations()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { setOpenMobile } = useSidebar()
  const [query, setQuery] = useState('')

  const needle = query.trim().toLowerCase()
  const shown = conversations?.filter(({ title }) => title.toLowerCase().includes(needle))

  // On a phone the sidebar is covering the thing you just chose.
  const go = (path: string) => {
    setOpenMobile(false)
    void navigate(path)
  }

  const remove = (id: string) => {
    removeConversation(id)
    if (pathname === chatPath(id)) void navigate(newChatPath(), { replace: true })
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                data-testid="chat-new"
                onClick={() => go(newChatPath())}
              >
                <PlusIcon />
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Chats</SidebarGroupLabel>
        <SidebarGroupContent className="flex flex-col gap-2">
          {/* Worth the room only once there's a list to cut down. */}
          {(conversations?.length ?? 0) > 1 && (
            <SidebarInput
              data-testid="chat-search"
              type="search"
              placeholder="Search chats"
              aria-label="Search chats"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          <SidebarMenu data-testid="chat-list">
            {shown?.map(({ id, title }) => (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton size="lg" asChild isActive={pathname === chatPath(id)}>
                  <Link
                    to={chatPath(id)}
                    data-testid={`chat-open-${id}`}
                    onClick={() => setOpenMobile(false)}
                  >
                    <span>{title}</span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuAction
                  data-testid={`chat-delete-${id}`}
                  aria-label={`Delete ${title}`}
                  // The icon is small; the tappable square around it is not.
                  className="after:-inset-3"
                  onClick={() => remove(id)}
                >
                  <Trash2Icon />
                </SidebarMenuAction>
              </SidebarMenuItem>
            ))}
            {shown?.length === 0 && (
              <p
                className="text-sidebar-foreground/60 px-2 py-1 text-sm"
                data-testid={needle ? 'chat-list-no-match' : 'chat-list-empty'}
              >
                {needle ? `Nothing matches "${query.trim()}".` : 'Nothing yet.'}
              </p>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  )
}
