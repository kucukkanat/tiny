import { safeValidateUIMessages } from 'ai'
import { useSyncExternalStore } from 'react'
import * as z from 'zod'
import { textOf, type ChatMessage } from './model'

// One key per conversation. Saving one doesn't re-serialise the whole history,
// and two tabs writing different conversations don't overwrite each other.
const PREFIX = 'tiny.chat.'

export type Conversation = {
  readonly id: string
  readonly title: string
  readonly updatedAt: number
  readonly messages: readonly ChatMessage[]
}

export const chatPath = (id: string) => `/chat/${id}`

/** Where a message you started but didn't send waits for you to come back. */
export const draftKey = (id: string) => `tiny.draft.${id}`

// Unique enough to name a conversation, and available outside a secure context —
// `crypto.randomUUID` is not, which bites the moment you open the dev server on
// a phone over plain http.
export const newChatPath = () =>
  chatPath(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`)

// The store is a module, not a context: the sidebar and the screen are siblings
// under the shell and both need the same list, live.
let conversations: readonly Conversation[] | undefined
const listeners = new Set<() => void>()

const publish = (next: readonly Conversation[]) => {
  conversations = [...next].sort((a, b) => b.updatedAt - a.updatedAt)
  for (const listener of listeners) listener()
}

const Stored = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  messages: z.array(z.unknown()),
})

// A missing key and unparseable JSON are the same answer: nothing usable.
const parse = (raw: string | null): unknown => {
  try {
    return JSON.parse(raw ?? '')
  } catch {
    return null
  }
}

/**
 * A tool call that never came back — a question nobody answered, a tool whose
 * extension was switched off mid-call — would be sent as a call with no result,
 * and every provider rejects that. The reply is over; drop what's still waiting.
 */
const settled = (message: { parts?: unknown }): unknown => {
  const parts = Array.isArray(message.parts) ? message.parts : []
  return {
    ...message,
    parts: parts.filter(
      (part) =>
        !(
          typeof part === 'object' &&
          part !== null &&
          'type' in part &&
          part.type === 'dynamic-tool' &&
          'state' in part &&
          (part.state === 'input-streaming' || part.state === 'input-available')
        ),
    ),
  }
}

// Storage written by an older build is worth exactly nothing, so anything the
// SDK won't vouch for is dropped rather than crashing the screen.
const read = async (key: string): Promise<Conversation | null> => {
  const stored = Stored.safeParse(parse(localStorage.getItem(key)))
  if (!stored.success) return null

  // The SDK owns the message shape, so let it say whether this is still one.
  const checked = await safeValidateUIMessages<ChatMessage>({
    messages: stored.data.messages.map((message) =>
      typeof message === 'object' && message !== null ? settled(message) : message,
    ),
  })
  return checked.success ? { ...stored.data, messages: checked.data } : null
}

const hydrate = async () => {
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(PREFIX))
  const stored = (await Promise.all(keys.map(read))).filter((one) => one !== null)

  // Reading takes a moment and a write can land inside it. Whatever was written
  // while we were reading is the newer truth and outranks what we read.
  const written = conversations ?? []
  publish([
    ...stored.filter(({ id }) => !written.some((one) => one.id === id)),
    ...written,
  ])
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
export const titleOf = (messages: readonly ChatMessage[]): string => {
  const first = messages.find((message) => message.role === 'user')
  const said = first ? textOf(first.parts).trim() : ''
  return said ? said.slice(0, 60) : 'New chat'
}

export const saveConversation = (id: string, messages: readonly ChatMessage[]) => {
  const conversation = { id, title: titleOf(messages), updatedAt: Date.now(), messages }
  publish([conversation, ...(conversations ?? []).filter((one) => one.id !== id)])
  localStorage.setItem(PREFIX + id, JSON.stringify(conversation))
}

export const removeConversation = (id: string) => {
  publish((conversations ?? []).filter((one) => one.id !== id))
  localStorage.removeItem(PREFIX + id)
  localStorage.removeItem(draftKey(id))
}

/** Every conversation, newest first, or `undefined` while storage is being read. */
export const useConversations = (): readonly Conversation[] | undefined =>
  useSyncExternalStore(subscribe, () => conversations)
