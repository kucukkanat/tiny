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
