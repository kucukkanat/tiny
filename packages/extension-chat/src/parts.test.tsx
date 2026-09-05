import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'
import type { ChatMessage } from './model'
import type { Message, MessageAction, Thread } from '@tiny/host'
import { MessageFooter, MessageParts, Thinking } from './parts'

const show = (parts: ChatMessage['parts'], streaming = false) =>
  render(<MessageParts parts={parts} streaming={streaming} />)

test('text is rendered', () => {
  show([{ type: 'text', text: 'the answer' }])
  expect(document.body.textContent).toContain('the answer')
})

test('reasoning gets its own block, shut until you open it', () => {
  show([{ type: 'reasoning', text: 'first, consider', state: 'done' }])

  const block = screen.getByTestId('message-reasoning')
  expect(block.querySelector('button')?.getAttribute('aria-expanded')).toBe('false')
  expect(block.textContent).toContain('Thought it through')
  expect(block.textContent).toContain('first, consider')
})

test('reasoning still coming in says so', () => {
  show([{ type: 'reasoning', text: 'weighing it up', state: 'streaming' }])
  expect(screen.getByTestId('message-reasoning').textContent).toContain('Thinking')
})

test('reasoning and the answer both show, in order', () => {
  show([
    { type: 'reasoning', text: 'thinking about it', state: 'done' },
    { type: 'text', text: 'the answer' },
  ])

  expect(screen.getByTestId('message-reasoning')).toBeDefined()
  expect(document.body.textContent).toContain('the answer')
})

test('a part with no UI behind it is skipped, not a crash', () => {
  show([
    { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,' },
    { type: 'text', text: 'still here' },
  ])

  expect(document.body.textContent).toContain('still here')
})

test('waiting on the first token says what it is doing', () => {
  render(<Thinking />)
  expect(screen.getByTestId('chat-thinking').textContent).toBe('Thinking0.0s')
})

const reply: Message = { id: 'm1', role: 'assistant', text: 'the whole answer' }

const thread = (over: Partial<Thread> = {}): Thread => ({
  id: 'c1',
  title: 'A chat',
  model: 'test-model',
  messages: [reply],
  send: () => {},
  ...over,
})

const footer = (actions: readonly MessageAction[] = [], message = reply) =>
  render(<MessageFooter message={message} thread={thread()} actions={actions} />)

test('a message can be copied, and says when it has been', async () => {
  const copied: string[] = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => void copied.push(text) },
  })

  footer()
  const button = screen.getByTestId('message-copy')
  expect(button.textContent).toContain('Copy')

  fireEvent.click(button)
  expect(copied).toEqual(['the whole answer'])
  await waitFor(() => expect(button.textContent).toContain('Copied'))
})

test("an extension's action is handed the message and the thread", () => {
  const seen: [Message, Thread][] = []
  footer([{ label: 'Save', run: (message, one) => void seen.push([message, one]) }])

  fireEvent.click(screen.getByTestId('message-action-save'))
  expect(seen[0]?.[0]).toEqual(reply)
  expect(seen[0]?.[1].messages).toEqual([reply])
  expect(seen[0]?.[1].model).toBe('test-model')
})

test('`when` decides which messages an action appears on', () => {
  const only = (role: Message['role']): MessageAction => ({
    label: 'Redo',
    when: (message) => message.role === role,
    run: () => {},
  })

  footer([only('user')])
  expect(screen.queryByTestId('message-action-redo')).toBeNull()

  footer([only('assistant')])
  expect(screen.getByTestId('message-action-redo')).toBeDefined()
})

test('a named icon is drawn, an unknown one is drawn as it stands', () => {
  footer([
    { label: 'Again', icon: 'retry', run: () => {} },
    { label: 'Star', icon: '★', run: () => {} },
    { label: 'Plain', run: () => {} },
  ])

  expect(screen.getByTestId('message-action-again').querySelector('svg')).toBeDefined()
  expect(screen.getByTestId('message-action-star').textContent).toContain('★')
  // Nothing to draw but the words, so the words are what it draws.
  expect(screen.getByTestId('message-action-plain').textContent).toContain('Plain')
})

test('an action that throws says so instead of taking the screen down', async () => {
  footer([
    {
      label: 'Break',
      run: () => {
        throw new Error('nope')
      },
    },
  ])

  fireEvent.click(screen.getByTestId('message-action-break'))
  expect(screen.getByTestId('message-action-error').textContent).toBe('Break: nope')
})

test('an action is out of use while what it returned is still going', async () => {
  let finish = () => {}
  footer([{ label: 'Wait', run: () => new Promise<void>((done) => (finish = done)) }])

  const button = screen.getByTestId('message-action-wait')
  fireEvent.click(button)
  expect(button.hasAttribute('disabled')).toBe(true)

  await act(async () => void finish())
  expect(button.hasAttribute('disabled')).toBe(false)
})

test('an icon name off Object.prototype is a string, not a component', () => {
  // A bare index into an object literal answers `constructor` with a function,
  // which React would then try to render.
  footer([{ label: 'Oops', icon: 'constructor', run: () => {} }])
  expect(screen.getByTestId('message-action-oops').textContent).toContain('constructor')
})

test('a `when` that throws shows the button rather than taking chat down', () => {
  footer([
    {
      label: 'Rude',
      when: () => {
        throw new Error('boom')
      },
      run: () => {},
    },
  ])
  expect(screen.getByTestId('message-action-rude')).toBeDefined()
})

test('a button with only words says them once, not twice', () => {
  footer([{ label: 'Plain', run: () => {} }])
  expect(screen.getByTestId('message-action-plain').textContent).toBe('Plain')
})

test('a promise from somewhere else still parks the button', async () => {
  let finish = () => {}
  const foreign = {
    then: (ok: () => void) => {
      finish = ok
    },
  }
  footer([{ label: 'Odd', run: () => foreign as unknown as Promise<void> }])

  const button = screen.getByTestId('message-action-odd')
  fireEvent.click(button)
  expect(button.hasAttribute('disabled')).toBe(true)

  await act(async () => void finish())
  expect(button.hasAttribute('disabled')).toBe(false)
})

test('a button keeps its own pending state when one above it goes away', async () => {
  let finish = () => {}
  const hides: MessageAction = { label: 'First', when: () => true, run: () => {} }
  const waits: MessageAction = {
    label: 'Second',
    run: () => new Promise<void>((done) => (finish = done)),
  }

  const { rerender } = render(
    <MessageFooter message={reply} thread={thread()} actions={[hides, waits]} />,
  )
  fireEvent.click(screen.getByTestId('message-action-second'))
  expect(screen.getByTestId('message-action-second').hasAttribute('disabled')).toBe(true)

  // `First` drops out, so `Second` moves up a place in what is drawn.
  rerender(
    <MessageFooter
      message={reply}
      thread={thread()}
      actions={[{ ...hides, when: () => false }, waits]}
    />,
  )
  expect(screen.queryByTestId('message-action-first')).toBeNull()
  expect(screen.getByTestId('message-action-second').hasAttribute('disabled')).toBe(true)

  await act(async () => void finish())
  expect(screen.getByTestId('message-action-second').hasAttribute('disabled')).toBe(false)
})

test('a send refused mid-answer is said out loud, not swallowed', () => {
  render(
    <MessageFooter
      message={reply}
      thread={thread({
        send: () => {
          throw new Error('The model is still answering.')
        },
      })}
      actions={[{ label: 'Again', run: (_message, one) => one.send('again') }]}
    />,
  )

  fireEvent.click(screen.getByTestId('message-action-again'))
  expect(screen.getByTestId('message-action-error').textContent).toBe(
    'Again: The model is still answering.',
  )
})

test('two extensions may offer the same label, and both are drawn', () => {
  footer([
    { label: 'Save', run: () => {} },
    { label: 'Save', run: () => {} },
  ])
  expect(screen.getAllByTestId('message-action-save')).toHaveLength(2)
})

test('the thinking row counts the seconds it has been waiting', async () => {
  render(<Thinking />)
  const row = screen.getByTestId('chat-thinking')
  expect(row.textContent).toBe('Thinking0.0s')

  await waitFor(() => expect(row.textContent).toBe('Thinking1.0s'), { timeout: 2500 })
})

test('a tool still running is named, so you know what it is waiting on', () => {
  show([
    {
      type: 'dynamic-tool',
      toolName: 'weather',
      toolCallId: 'call-1',
      state: 'input-available',
      input: { city: 'Istanbul' },
    },
  ])

  expect(screen.getByTestId('message-tool').textContent).toContain('weather')
})

test('a finished tool shows what went in and what came back', () => {
  show([
    {
      type: 'dynamic-tool',
      toolName: 'weather',
      toolCallId: 'call-1',
      state: 'output-available',
      input: { city: 'Istanbul' },
      output: { celsius: '19' },
    },
  ])

  const block = screen.getByTestId('message-tool')
  expect(block.textContent).toContain('Istanbul')
  expect(block.textContent).toContain('19')
})

test('a tool that failed says so instead of swallowing it', () => {
  show([
    {
      type: 'dynamic-tool',
      toolName: 'weather',
      toolCallId: 'call-1',
      state: 'output-error',
      input: { city: 'Istanbul' },
      errorText: 'wttr.in said 503',
    },
  ])

  const block = screen.getByTestId('message-tool')
  expect(block.textContent).toContain('weather failed')
  expect(block.textContent).toContain('wttr.in said 503')
})

const call = (name: string, id: string) =>
  ({
    type: 'dynamic-tool',
    toolName: name,
    toolCallId: id,
    state: 'output-available',
    input: { city: 'Istanbul' },
    output: { celsius: '19' },
  }) as const

test('a run of calls is one row, not one box each', () => {
  show([call('weather', 'call-1'), call('time', 'call-2')])

  expect(screen.getAllByTestId('message-tools')).toHaveLength(1)
  expect(screen.getByTestId('message-tools').textContent).toContain('2 tool calls')
  expect(screen.getAllByTestId('message-tool')).toHaveLength(2)
})

test('calls either side of an answer are separate runs', () => {
  show([
    call('weather', 'call-1'),
    { type: 'text', text: 'warm' },
    call('time', 'call-2'),
  ])

  expect(screen.getAllByTestId('message-tools')).toHaveLength(2)
})

test('what a tool was handed can be copied off the block showing it', () => {
  const copied: string[] = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => void copied.push(text) },
  })

  show([call('weather', 'call-1')])
  fireEvent.click(screen.getByTestId('code-copy-input'))

  expect(copied).toEqual([JSON.stringify({ city: 'Istanbul' }, null, 2)])
})
