import type { ChatMessage } from '@tiny/llm'
import { persisted, useStore } from '@tiny/store'

export type Chat = {
  id: string
  title: string
  updatedAt: number
  messages: ChatMessage[]
  /** Set when the last send failed, cleared on the next one. */
  error?: string
}

export const chats = persisted<Chat[]>('tiny.chats', [])
export const drafts = persisted<Record<string, string>>('tiny.drafts', {})

export const useChats = () => useStore(chats)
export const useDraft = (key: string) => useStore(drafts)[key] ?? ''
export const setDraft = (key: string, text: string) => drafts.set((d) => ({ ...d, [key]: text }))

/** First line of the opening prompt, short enough for a sidebar row. */
export const titleFrom = (prompt: string) => {
  const line = prompt.trim().split('\n')[0]
  return line.length > 40 ? `${line.slice(0, 40).trimEnd()}…` : line || 'New chat'
}

export function createChat(prompt: string): Chat {
  const chat: Chat = { id: crypto.randomUUID(), title: titleFrom(prompt), updatedAt: Date.now(), messages: [] }
  chats.set((list) => [chat, ...list])
  return chat
}

/** Applies `patch` to one chat and floats it to the top of the list. */
export function updateChat(id: string, patch: (chat: Chat) => Chat) {
  chats.set((list) => {
    const chat = list.find((c) => c.id === id)
    if (!chat) return list
    return [{ ...patch(chat), updatedAt: Date.now() }, ...list.filter((c) => c.id !== id)]
  })
}

export const appendMessage = (id: string, message: ChatMessage) =>
  updateChat(id, (c) => ({ ...c, messages: [...c.messages, message] }))

/** Grows the trailing assistant message as tokens arrive. */
export const appendDelta = (id: string, text: string) =>
  updateChat(id, (c) => ({
    ...c,
    messages: c.messages.map((m, i) =>
      i === c.messages.length - 1 ? { ...m, content: m.content + text } : m,
    ),
  }))

export function removeChat(id: string) {
  chats.set((list) => list.filter((c) => c.id !== id))
  drafts.set(({ [id]: _, ...rest }) => rest)
}

/** Drops a trailing empty assistant turn left by an abort or an early failure. */
export const settle = (id: string) =>
  updateChat(id, (c) => ({
    ...c,
    messages: c.messages.filter((m, i) => i < c.messages.length - 1 || m.role !== 'assistant' || m.content !== ''),
  }))
