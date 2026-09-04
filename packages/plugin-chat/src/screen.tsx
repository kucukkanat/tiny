import { useChat } from '@ai-sdk/react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@tiny/ui/components/ai-elements/conversation'
import { Message, MessageContent } from '@tiny/ui/components/ai-elements/message'
import type { ChatAction } from '@tiny/plugin-host'
import { DirectChatTransport, type LanguageModel, type ToolSet } from 'ai'
import { useEffect, useMemo, useRef, type ComponentType, type ReactNode } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router'
import { Composer } from './composer'
import {
  draftKey,
  newChatPath,
  saveConversation,
  useConversations,
} from './conversations'
import { agentFor, textOf, type ChatMessage } from './model'
import { MessageParts, ReplyActions, Thinking } from './parts'
import { SelectionActions } from './selection'

/** What to call, what it's named, and what else you could switch to. */
export type ChatModel = {
  readonly model: LanguageModel
  readonly name: string
  readonly names: readonly string[]
  readonly select: (name: string) => void
}

/**
 * Everything chat needs from outside itself. The app is what fills these in.
 *
 * `useModel` and `useTools` are hooks, so `chat(options)` must be called once,
 * at module scope, with the same functions for the life of the app — that is
 * what makes the calls below as fixed as a static import would be.
 */
export type ChatOptions = {
  readonly useModel: () => ChatModel | undefined
  /** Shown instead of the thread while `useModel` has nothing to call. */
  readonly unconfigured?: ReactNode
  /** The tools the model may call mid-answer. */
  readonly useTools?: () => ToolSet
  /** Added to the model's system prompt. */
  readonly useSystem?: () => string | undefined
  /** Offered beside the built-in five when a passage is highlighted. */
  readonly useActions?: () => readonly ChatAction[]
  /** Rendered between the thread and the composer. */
  readonly Panel?: ComponentType
}

// Shared empties, so a chat given none of these doesn't rebuild its agent every
// render on a fresh `{}`.
const NO_TOOLS: ToolSet = {}
const noTools = () => NO_TOOLS
const NO_ACTIONS: readonly ChatAction[] = []
const noActions = () => NO_ACTIONS
const noSystem = () => undefined

/** `/#/chat/:id`. Anything else is a conversation that hasn't started yet. */
export function ChatScreen(options: ChatOptions) {
  return (
    <Routes>
      <Route path=":id" element={<Thread {...options} />} />
      <Route path="*" element={<Navigate to={newChatPath()} replace />} />
    </Routes>
  )
}

function Thread({
  useModel,
  unconfigured,
  useTools = noTools,
  useSystem = noSystem,
  useActions = noActions,
  Panel,
}: ChatOptions) {
  const { id = '' } = useParams()
  // oxlint-disable-next-line react/rules-of-hooks -- bound once, in the app
  const chosen = useModel()
  // oxlint-disable-next-line react/rules-of-hooks -- bound once, in the app
  const tools = useTools()
  // oxlint-disable-next-line react/rules-of-hooks -- bound once, in the app
  const instructions = useSystem()
  // oxlint-disable-next-line react/rules-of-hooks -- bound once, in the app
  const actions = useActions()
  const conversations = useConversations()

  if (!chosen) return unconfigured

  // Nothing can be sent before storage has been read, which is what keeps a
  // first message from racing the conversation it belongs to.
  if (conversations === undefined) return null

  // Remounting reseeds the messages and the draft, so the id is the whole key:
  // switching model swaps the transport without throwing the thread away.
  return (
    <Chat
      key={id}
      id={id}
      chosen={chosen}
      tools={tools}
      instructions={instructions}
      actions={actions}
      Panel={Panel}
      history={
        conversations.find((conversation) => conversation.id === id)?.messages ?? []
      }
    />
  )
}

function Chat({
  id,
  chosen,
  tools,
  instructions,
  actions,
  Panel,
  history,
}: {
  id: string
  chosen: ChatModel
  tools: ToolSet
  instructions?: string
  actions: readonly ChatAction[]
  Panel?: ComponentType
  history: readonly ChatMessage[]
}) {
  const transport = useMemo(
    () => new DirectChatTransport({ agent: agentFor(chosen.model, tools, instructions) }),
    [chosen.model, tools, instructions],
  )

  const { messages, sendMessage, status, error, stop } = useChat<ChatMessage>({
    transport,
    messages: [...history],
    // Without this every streamed token is its own render and its own save.
    experimental_throttle: 100,
  })

  // Leaving a conversation mid-stream shouldn't leave the request running.
  useEffect(() => () => void stop(), [stop])

  // Storage already holds what we were handed. Writing it back would stamp a
  // conversation as touched for being read, and give an untouched one a row in
  // the sidebar it hasn't earned.
  const written = useRef(messages)
  useEffect(() => {
    if (messages === written.current) return
    written.current = messages
    saveConversation(id, messages)
  }, [id, messages])

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-3">
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState title={chosen.name} description="Ask it something." />
          ) : (
            messages.map((message) => {
              const live = status === 'streaming' && message === messages.at(-1)
              return (
                <Message
                  key={message.id}
                  from={message.role}
                  data-testid={`message-${message.role}`}
                >
                  <MessageContent>
                    <MessageParts parts={message.parts} streaming={live} />
                  </MessageContent>
                  {message.role === 'assistant' && !live && (
                    <ReplyActions text={textOf(message.parts)} />
                  )}
                </Message>
              )
            })
          )}
          {status === 'submitted' && <Thinking />}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {error && (
        <p className="text-destructive text-sm" data-testid="chat-error">
          {error.message}
        </p>
      )}

      {Panel && <Panel />}

      <SelectionActions extra={actions} onPick={(text) => void sendMessage({ text })} />

      <Composer
        draftKey={draftKey(id)}
        model={chosen.name}
        models={chosen.names}
        status={status}
        onSend={(text) => void sendMessage({ text })}
        onStop={() => void stop()}
        onModel={chosen.select}
      />
    </div>
  )
}
