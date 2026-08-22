import { beforeEach, describe, expect, it } from 'vitest'
import { appendDelta, appendMessage, chats, createChat, drafts, removeChat, settle, setDraft, titleFrom } from './chats'

beforeEach(() => {
  chats.set([])
  drafts.set({})
})

describe('titleFrom', () => {
  it('takes the first line', () => {
    expect(titleFrom('Rename the flavors\nand then ship it')).toBe('Rename the flavors')
  })

  it('elides a long prompt', () => {
    expect(titleFrom('x'.repeat(80))).toBe(`${'x'.repeat(40)}…`)
  })

  it('names an empty prompt', () => {
    expect(titleFrom('   ')).toBe('New chat')
  })
})

describe('chats', () => {
  it('puts new chats first', () => {
    const first = createChat('one')
    const second = createChat('two')
    expect(chats.get().map((c) => c.id)).toEqual([second.id, first.id])
  })

  it('floats the chat being written to back to the top', () => {
    const first = createChat('one')
    createChat('two')
    appendMessage(first.id, { role: 'user', content: 'hi' })
    expect(chats.get()[0].id).toBe(first.id)
  })

  it('grows the trailing assistant message as tokens arrive', () => {
    const chat = createChat('hi')
    appendMessage(chat.id, { role: 'user', content: 'hi' })
    appendMessage(chat.id, { role: 'assistant', content: '' })
    appendDelta(chat.id, 'Hel')
    appendDelta(chat.id, 'lo')
    expect(chats.get()[0].messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hello' },
    ])
  })

  it('drops an assistant turn that never produced a token', () => {
    const chat = createChat('hi')
    appendMessage(chat.id, { role: 'user', content: 'hi' })
    appendMessage(chat.id, { role: 'assistant', content: '' })
    settle(chat.id)
    expect(chats.get()[0].messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('keeps a partial answer when a stream is stopped', () => {
    const chat = createChat('hi')
    appendMessage(chat.id, { role: 'assistant', content: 'half a th' })
    settle(chat.id)
    expect(chats.get()[0].messages).toHaveLength(1)
  })

  it('deleting a chat takes its draft with it', () => {
    const chat = createChat('hi')
    setDraft(chat.id, 'unsent')
    removeChat(chat.id)
    expect(chats.get()).toEqual([])
    expect(drafts.get()).toEqual({})
  })
})
