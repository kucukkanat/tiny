import { ConfirmDelete } from '@tiny/ui/components/confirm-delete'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@tiny/ui/components/sidebar'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
  chatPath,
  newChatPath,
  removeConversation,
  useConversations,
} from './conversations'

/** Row height: thumb-sized where there's no cursor, tight where there is. */
const ROW = 'h-11 md:h-8'

/** How far a row slides to uncover the delete behind it. */
const REVEAL = 64

/**
 * A conversation. On a pointer device the delete waits for a hover; on a touch
 * one it waits behind the row, because a permanent trash icon a thumb's width
 * from the thing you meant to tap is a mis-tap waiting to happen.
 */
function ChatRow({
  id,
  title,
  active,
  swiped,
  onSwipe,
  onOpen,
  onDelete,
}: {
  id: string
  title: string
  active: boolean
  swiped: boolean
  onSwipe: (swiped: boolean) => void
  onOpen: () => void
  onDelete: () => void
}) {
  // Where the finger is, or null when it isn't down. Resting position is the
  // parent's business, so only one row can sit open at a time.
  const [live, setLive] = useState<number | null>(null)
  const from = useRef<{ x: number; y: number; slid: number | null } | null>(null)
  const offset = live ?? (swiped ? REVEAL : 0)

  const start = (event: PointerEvent<HTMLDivElement>) => {
    // A mouse has hover; it doesn't need to drag anything.
    if (event.pointerType === 'mouse') return
    from.current = { x: event.clientX, y: event.clientY, slid: null }
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const grip = from.current
    if (!grip) return
    const dx = grip.x - event.clientX
    // Until it's clearly sideways, it's the list scrolling and not our gesture.
    if (
      grip.slid === null &&
      (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(grip.y - event.clientY))
    )
      return
    // On the ref as well as in state: the release reads it, and a flick can put
    // both events in one batch, where the state it sees would still be null.
    grip.slid = Math.max(0, Math.min(REVEAL, dx))
    setLive(grip.slid)
  }

  const end = () => {
    const slid = from.current?.slid
    if (slid !== null && slid !== undefined) onSwipe(slid > REVEAL / 2)
    from.current = null
    setLive(null)
  }

  return (
    <SidebarMenuItem
      className="overflow-hidden rounded-md"
      data-testid={`chat-row-${id}`}
      data-swiped={offset > 0}
    >
      <div
        // pan-y leaves vertical scrolling to the browser and gives us sideways.
        className="relative z-10 touch-pan-y bg-sidebar transition-transform md:z-auto md:bg-transparent"
        style={{ transform: `translateX(-${offset}px)` }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <SidebarMenuButton asChild isActive={active} className={`${ROW} pr-2 md:pr-9`}>
          <Link
            to={chatPath(id)}
            data-testid={`chat-open-${id}`}
            onClick={(event) => {
              // A row that's open is showing you a choice; take that back first.
              if (offset > 0) {
                event.preventDefault()
                onSwipe(false)
                return
              }
              onOpen()
            }}
          >
            <span>{title}</span>
          </Link>
        </SidebarMenuButton>
      </div>

      <ConfirmDelete
        name={title}
        note="The conversation and anything drafted in it go for good."
        onConfirm={onDelete}
      >
        <button
          type="button"
          data-testid={`chat-delete-${id}`}
          aria-label={`Delete ${title}`}
          // Full height of the row on touch so the swipe uncovers a real target;
          // a centred square inside the row on a pointer device.
          className="bg-red-tint text-red md:text-ink-2 absolute inset-y-0 right-0 flex w-16 items-center justify-center transition-opacity md:right-1 md:my-auto md:size-7 md:rounded-md md:bg-transparent md:opacity-0 md:group-focus-within/menu-item:opacity-100 md:group-hover/menu-item:opacity-100 md:hover:bg-red-tint md:hover:text-red md:focus-visible:opacity-100"
        >
          <Trash2Icon className="size-4" />
        </button>
      </ConfirmDelete>
    </SidebarMenuItem>
  )
}

/** Every conversation you've had, newest first, plus a way to start another. */
export function ChatSidebar() {
  const conversations = useConversations()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { setOpenMobile } = useSidebar()
  const [query, setQuery] = useState('')
  const [swiped, setSwiped] = useState<string | null>(null)

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
                data-testid="chat-new"
                className={ROW}
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
              <ChatRow
                key={id}
                id={id}
                title={title}
                active={pathname === chatPath(id)}
                swiped={swiped === id}
                onSwipe={(open) => setSwiped(open ? id : null)}
                onOpen={() => setOpenMobile(false)}
                onDelete={() => remove(id)}
              />
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
