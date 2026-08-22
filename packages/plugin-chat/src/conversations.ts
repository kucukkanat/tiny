import { safeValidateUIMessages } from 'ai'
import { useSyncExternalStore } from 'react'
import * as z from 'zod'
import type { ChatMessage } from './model'

const STORAGE_KEY = 'tiny.chat.conversations'

export type Conversation = {
  readonly id: string
  readonly title: string
  readonly updatedAt: number
  readonly messages: readonly ChatMessage[]
}

/** Where a conversation that doesn't exist yet lives. */
export const newChatPath = () => `/chat/${crypto.randomUUID()}`

export const chatPath = (id: string) => `/chat/${id}`

// The store is a module, not a context: the sidebar and the screen are siblings
// under the shell and both need the same list, live.
let conversations: readonly Conversation[] | undefined
const listeners = new Set<() => void>()

const newestFirst = (a: Conversation, b: Conversation) => b.updatedAt - a.updatedAt

const publish = (next: readonly Conversation[]) => {
  conversations = [...next].sort(newestFirst)
  for (const listener of listeners) listener()
}

const write = (next: readonly Conversation[]) => {
  publish(next)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
}

const Stored = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    updatedAt: z.number(),
    messages: z.array(z.unknown()),
  }),
)

// Storage written by an older build is worth exactly nothing, so anything the
// SDK won't vouch for is dropped rather than crashing the screen.
const parse = (raw: string | null): unknown => {
  if (raw === null) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

const hydrate = async () => {
  const stored = Stored.safeParse(parse(localStorage.getItem(STORAGE_KEY)))
  const checked = await Promise.all(
    (stored.success ? stored.data : []).map(async (conversation) => {
      // The SDK owns the message shape, so let it say whether this is still one.
      const result = await safeValidateUIMessages<ChatMessage>({
        messages: conversation.messages,
      })
      return result.success ? { ...conversation, messages: result.data } : null
    }),
  )
  const read = checked.filter((conversation) => conversation !== null)

  // Reading storage takes a moment, and a write can land inside it. Whatever was
  // written while we were reading is the newer truth and outranks what we read.
  const written = conversations
  if (written === undefined) return publish(read)
  write([...read.filter(({ id }) => !written.some((one) => one.id === id)), ...written])
}

// The cache lives only as long as something is watching it, so the first
// watcher always starts from what is actually in storage.
const subscribe = (listener: () => void) => {
  if (conversations === undefined) void hydrate()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) conversations = undefined
  }
}

/** The first thing you said, which is what you'll recognise it by. */
const titleOf = (messages: readonly ChatMessage[]): string => {
  const said = messages
    .find((message) => message.role === 'user')
    ?.parts.map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim()
  return said ? said.slice(0, 60) : 'New chat'
}

export const saveConversation = (id: string, messages: readonly ChatMessage[]) =>
  write([
    { id, title: titleOf(messages), updatedAt: Date.now(), messages },
    ...(conversations ?? []).filter((conversation) => conversation.id !== id),
  ])

export const removeConversation = (id: string) =>
  write((conversations ?? []).filter((conversation) => conversation.id !== id))

/** Every conversation, newest first, or `undefined` while storage is being read. */
export const useConversations = (): readonly Conversation[] | undefined =>
  useSyncExternalStore(subscribe, () => conversations)
