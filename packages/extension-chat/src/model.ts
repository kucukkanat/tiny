import type { Message } from '@tiny/host'
import {
  ToolLoopAgent,
  type InferAgentUIMessage,
  type LanguageModel,
  type ToolSet,
} from 'ai'

// `stopWhen` already defaults to twenty steps, so a tool the model calls gets
// answered and the reply carries on without anything else being said here.
export const agentFor = (model: LanguageModel, tools: ToolSet, instructions?: string) =>
  new ToolLoopAgent(instructions ? { model, tools, instructions } : { model, tools })

export type ChatMessage = InferAgentUIMessage<ReturnType<typeof agentFor>>

/** Everything a message said out loud, with the non-text parts left out. */
export const textOf = (parts: ChatMessage['parts']): string =>
  parts.map((part) => (part.type === 'text' ? part.text : '')).join('')

/**
 * Held against the message object rather than recomputed, because a streaming
 * reply publishes a fresh array ten times a second and every settled message in
 * it is the same object each time — so this walks the parts of a message once,
 * where the screen used to walk them on every frame.
 */
const seen = new WeakMap<ChatMessage, Message>()

/**
 * One message as an extension sees it. The app never makes a system message —
 * the system prompt is `instructions` — and one that turned up would draw as a
 * reply anyway, so it is read as one rather than given a third case.
 */
export const asSeen = (message: ChatMessage): Message => {
  const already = seen.get(message)
  if (already) return already

  const one: Message = {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    text: textOf(message.parts),
  }
  seen.set(message, one)
  return one
}
