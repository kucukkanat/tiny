import { useChat } from '@ai-sdk/react'
import { isUsable, useProvider, type Provider } from '@tiny/plugin-settings'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@tiny/ui/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@tiny/ui/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@tiny/ui/components/ai-elements/prompt-input'
import { DirectChatTransport } from 'ai'
import { useEffect, useMemo, useRef } from 'react'
import { Link, Navigate, Route, Routes, useParams } from 'react-router'
import { newChatPath, saveConversation, useConversations } from './conversations'
import { agentFor, type ChatMessage } from './model'

/** `/#/chat/:id`. Anything else is a conversation that hasn't started yet. */
export function ChatScreen() {
  return (
    <Routes>
      <Route path=":id" element={<Thread />} />
      <Route path="*" element={<Navigate to={newChatPath()} replace />} />
    </Routes>
  )
}

function Thread() {
  const { id = '' } = useParams()
  const [provider] = useProvider()
  const conversations = useConversations()

  if (!isUsable(provider)) {
    return (
      <p className="text-muted-foreground mx-auto max-w-md py-8 text-center text-balance">
        Pick an endpoint, key and model in{' '}
        <Link
          to="/settings"
          data-testid="chat-to-settings"
          className="text-primary underline"
        >
          Settings
        </Link>{' '}
        first.
      </p>
    )
  }

  // Nothing can be sent before storage has been read, which is what keeps a
  // first message from racing the conversation it belongs to.
  if (conversations === undefined) return null

  // Remounting rebuilds the transport and reseeds the messages, which is what
  // both switching conversation and changing provider need.
  return (
    <Chat
      key={`${id}:${JSON.stringify(provider)}`}
      id={id}
      provider={provider}
      history={
        conversations.find((conversation) => conversation.id === id)?.messages ?? []
      }
    />
  )
}

function Chat({
  id,
  provider,
  history,
}: {
  id: string
  provider: Provider
  history: readonly ChatMessage[]
}) {
  const transport = useMemo(
    () => new DirectChatTransport({ agent: agentFor(provider) }),
    [provider],
  )

  const { messages, sendMessage, status, error } = useChat<ChatMessage>({
    transport,
    messages: [...history],
  })

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
            <ConversationEmptyState
              title={provider.model}
              description="Ask it something."
            />
          ) : (
            messages.map((message) => (
              <Message
                key={message.id}
                from={message.role}
                data-testid={`message-${message.role}`}
              >
                <MessageContent>
                  {message.parts.map((part, index) =>
                    part.type === 'text' ? (
                      <MessageResponse key={index}>{part.text}</MessageResponse>
                    ) : null,
                  )}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {error && (
        <p className="text-destructive text-sm" data-testid="chat-error">
          {error.message}
        </p>
      )}

      <PromptInput
        onSubmit={({ text }) => {
          if (text.trim().length > 0) void sendMessage({ text })
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            data-testid="chat-input"
            placeholder={`Message ${provider.model}`}
          />
        </PromptInputBody>
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit data-testid="chat-send" status={status} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
