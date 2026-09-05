import { useChat } from '@ai-sdk/react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@tiny/ui/components/ai-elements/conversation'
import { Message, MessageContent } from '@tiny/ui/components/ai-elements/message'
import type { ChatAction, MessageAction, Registry, Tiny } from '@tiny/host'
import { readModels, useProvider } from '@tiny/host/app'
import { DirectChatTransport, type LanguageModel, type ToolSet } from 'ai'
import { useEffect, useMemo, useRef } from 'react'
import { Link, Navigate, Route, Routes, useParams } from 'react-router'
import { Composer } from './composer'
import {
  draftKey,
  newChatPath,
  saveConversation,
  titleOf,
  useConversations,
} from './conversations'
import { agentFor, asSeen, type ChatMessage } from './model'
import { MessageFooter, MessageParts, Thinking } from './parts'
import { ToolQuestions } from './questions'
import { SelectionActions } from './selection'

/**
 * Nothing answers yet. Which of the two things to say depends on why: with no
 * dialect at all the Settings screen is switched off, and pointing at it would
 * land on a route that isn't there. Extensions is the one that always is.
 */
const Unconfigured = ({ specs }: { specs: Registry }) => (
  <p className="text-muted-foreground mx-auto max-w-md py-8 text-center text-balance">
    {Object.keys(specs).length === 0 ? (
      <>
        No model provider is switched on. Turn Settings back on in{' '}
        <Link
          to="/extensions"
          data-testid="chat-to-extensions"
          className="text-primary underline"
        >
          Extensions
        </Link>
        .
      </>
    ) : (
      <>
        Pick an endpoint, key and model in{' '}
        <Link
          to="/settings"
          data-testid="chat-to-settings"
          className="text-primary underline"
        >
          Settings
        </Link>{' '}
        first.
      </>
    )}
  </p>
)

/** `/#/chat/:id`. Anything else is a conversation that hasn't started yet. */
export function ChatScreen({ tiny }: { tiny: Tiny }) {
  return (
    <Routes>
      <Route path=":id" element={<Thread tiny={tiny} />} />
      <Route path="*" element={<Navigate to={newChatPath()} replace />} />
    </Routes>
  )
}

function Thread({ tiny }: { tiny: Tiny }) {
  const { id = '' } = useParams()
  /* oxlint-disable react/hooks -- `tiny` is built once, at the app's module
     scope, so every one of these is as fixed as an import would be. That is
     what the rule wants and what it cannot see from inside here. */
  const model = tiny.useModel()
  const tools = tiny.useTools()
  const instructions = tiny.useInstructions()
  const actions = tiny.useActions()
  const messageActions = tiny.useMessageActions()
  // The picker is the stored choice, not the model object: which names are on
  // offer and which one is set is state Settings writes and this one reads.
  const specs = tiny.useProviders()
  /* oxlint-enable react/hooks */
  const [provider, update] = useProvider(specs)
  // Read once: the list only changes on the Settings screen, which isn't this
  // one. Bare, it would re-parse storage on every throttled streaming render.
  const names = useMemo(() => readModels(), [])
  const conversations = useConversations()

  if (!model) return <Unconfigured specs={specs} />

  // Nothing can be sent before storage has been read, which is what keeps a
  // first message from racing the conversation it belongs to.
  if (conversations === undefined) return null

  // Remounting reseeds the messages and the draft, so the id is the whole key:
  // switching model swaps the transport without throwing the thread away.
  return (
    <Chat
      key={id}
      id={id}
      model={model}
      name={provider.model}
      names={names}
      select={(next) => update({ model: next })}
      tools={tools}
      instructions={instructions}
      actions={actions}
      messageActions={messageActions}
      history={
        conversations.find((conversation) => conversation.id === id)?.messages ?? []
      }
    />
  )
}

function Chat({
  id,
  model,
  name,
  names,
  select,
  tools,
  instructions,
  actions,
  messageActions,
  history,
}: {
  id: string
  model: LanguageModel
  name: string
  names: readonly string[]
  select: (name: string) => void
  tools: ToolSet
  instructions?: string
  actions: readonly ChatAction[]
  messageActions: readonly MessageAction[]
  history: readonly ChatMessage[]
}) {
  const transport = useMemo(
    () => new DirectChatTransport({ agent: agentFor(model, tools, instructions) }),
    [model, tools, instructions],
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

  /**
   * `status` in a closure is a render behind, so it cannot see a request the
   * same `run` just started — and two at once do not lose a reply, they
   * interleave and write both into the one conversation. One send per press is
   * the rule, and this is what holds it.
   */
  const sending = useRef(false)
  useEffect(() => {
    // Only once the answer is over. A render can land between the send and the
    // SDK saying it is out, and clearing on any render would undo the latch in
    // exactly the window it exists for.
    if (status !== 'submitted' && status !== 'streaming') sending.current = false
  }, [status])

  // The conversation as an extension sees it, handed to every action on every
  // message — so it is built once a render and not once a button. Its type is
  // checked where it lands, by `MessageFooter`.
  const thread = useMemo(
    () => ({
      id,
      // Derived, not read back: this is right before the first save lands.
      title: titleOf(messages),
      model: name,
      messages: messages.map(asSeen),
      send: (text: string) => {
        // Loud, because an extension can ask whether this is a good moment and
        // a silent no-op cannot be asked about.
        if (sending.current || status === 'submitted' || status === 'streaming')
          throw new Error('The model is still answering.')
        sending.current = true
        void sendMessage({ text })
      },
    }),
    [id, name, messages, status, sendMessage],
  )

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-3">
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState title={name} description="Ask it something." />
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
                  {/* Not while it is still arriving: half a reply is not what
                      an action was written to be handed. */}
                  {!live && (
                    <MessageFooter
                      message={asSeen(message)}
                      thread={thread}
                      actions={messageActions}
                    />
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

      <ToolQuestions />

      <SelectionActions extra={actions} onPick={(text) => void sendMessage({ text })} />

      <Composer
        draftKey={draftKey(id)}
        model={name}
        models={names}
        status={status}
        onSend={(text) => void sendMessage({ text })}
        onStop={() => void stop()}
        onModel={select}
      />
    </div>
  )
}
