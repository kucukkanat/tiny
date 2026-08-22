import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { streamChat, saveProvider, useActiveProvider } from '@tiny/llm'
import { Button, Message, PromptBar, Thinking } from '@tiny/ui'
import {
  appendDelta,
  appendMessage,
  createChat,
  settle,
  setDraft,
  updateChat,
  useChats,
  useDraft,
} from './chats'

/** In-flight streams, keyed by chat id — outlives the component so navigating away doesn't cut a reply off. */
const running = new Map<string, AbortController>()

export function ChatScreen() {
  const { id } = useParams()
  const chat = useChats().find((c) => c.id === id) ?? null
  const key = chat?.id ?? 'new'
  const draft = useDraft(key)
  const provider = useActiveProvider()
  const navigate = useNavigate()
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (id && !chat) navigate('/', { replace: true })
  }, [id, chat, navigate])

  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [chat?.messages])

  const busy = chat ? running.has(chat.id) : false
  const last = chat?.messages.at(-1)

  async function send() {
    const text = draft.trim()
    if (!text || busy) return
    if (!provider) return navigate('/settings')

    const target = chat ?? createChat(text)
    const history = [...target.messages, { role: 'user' as const, content: text }]
    setDraft(key, '')
    if (!chat) navigate(`/c/${target.id}`)
    updateChat(target.id, (c) => ({ ...c, error: undefined }))
    appendMessage(target.id, { role: 'user', content: text })
    appendMessage(target.id, { role: 'assistant', content: '' })

    const controller = new AbortController()
    running.set(target.id, controller)
    try {
      for await (const delta of streamChat(provider, { model: provider.model, messages: history, signal: controller.signal }))
        appendDelta(target.id, delta)
    } catch (e) {
      if (!controller.signal.aborted) updateChat(target.id, (c) => ({ ...c, error: String((e as Error)?.message ?? e) }))
    } finally {
      running.delete(target.id)
      settle(target.id)
    }
  }

  const composer = (
    <PromptBar
      value={draft}
      onChange={(next) => setDraft(key, next)}
      onSubmit={send}
      onStop={() => chat && running.get(chat.id)?.abort()}
      busy={busy}
      autoFocus={!chat}
      placeholder={provider ? `Message ${provider.label}…` : 'Add a provider to start chatting…'}
      models={provider?.models ?? []}
      model={provider?.model ?? ''}
      onModelChange={(model) => provider && saveProvider({ ...provider, model })}
    />
  )

  const notice = !provider && (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 text-[13px] text-ink-2">
      <span className="flex-1">No provider yet — add an API key to start chatting.</span>
      <Button variant="primary" data-testid="notice-settings" onClick={() => navigate('/settings')}>
        Open settings
      </Button>
    </div>
  )

  if (!chat || chat.messages.length === 0) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col justify-center gap-6 px-4 py-10 sm:px-8">
        <h1 className="text-[26px] leading-tight tracking-[-0.02em] text-ink">
          <span className="block text-ink-3">Hello</span>
          What can I help you with?
        </h1>
        {composer}
        {notice}
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-5 px-4 pt-6 sm:px-8">
        {chat.messages.map((m, i) => (
          <Message key={i} role={m.role}>
            {m.content}
          </Message>
        ))}
        {busy && !last?.content && <Thinking />}
        {chat.error && (
          <p className="rounded-card bg-red-tint px-3 py-2 text-[13px] text-red" data-testid="chat-error">
            {chat.error}
          </p>
        )}
        <div ref={end} />
      </div>
      <div className="sticky bottom-0 bg-page">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-4 pb-4 pt-3 sm:px-8">
          {notice}
          {composer}
        </div>
      </div>
    </div>
  )
}
