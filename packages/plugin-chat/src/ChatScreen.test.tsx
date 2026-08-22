import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@tiny/llm'
import { ChatScreen } from './ChatScreen'
import { chats, drafts } from './chats'

const provider: ProviderConfig = {
  id: 'p1',
  label: 'Test',
  kind: 'openai',
  baseUrl: 'https://x/v1',
  apiKey: 'k',
  models: ['m1'],
  model: 'm1',
}

let active: ProviderConfig | null = provider
let reply: () => AsyncIterable<string>

vi.mock('@tiny/llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiny/llm')>()),
  useActiveProvider: () => active,
  streamChat: () => reply(),
}))

const screenAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<ChatScreen />} />
        <Route path="/c/:id" element={<ChatScreen />} />
        <Route path="/settings" element={<p>settings screen</p>} />
      </Routes>
    </MemoryRouter>,
  )

const ask = async (text: string) => {
  await userEvent.type(screen.getByTestId('prompt-input'), text)
  await userEvent.click(screen.getByTestId('prompt-send'))
}

beforeEach(() => {
  chats.set([])
  drafts.set({})
  active = provider
  reply = async function* () {
    yield 'Hello '
    yield 'there'
  }
})

describe('ChatScreen', () => {
  it('streams a reply into a new chat', async () => {
    screenAt('/')
    await ask('hi')

    expect(await screen.findByTestId('message-user')).toHaveTextContent('hi')
    await waitFor(() => expect(screen.getByTestId('message-assistant')).toHaveTextContent('Hello there'))
    expect(chats.get()[0].title).toBe('hi')
  })

  it('keeps the reply in storage so a reload finds it', async () => {
    screenAt('/')
    await ask('hi')
    await waitFor(() => expect(chats.get()[0].messages.at(-1)?.content).toBe('Hello there'))
  })

  it('remembers an unsent draft', async () => {
    screenAt('/')
    await userEvent.type(screen.getByTestId('prompt-input'), 'half a thought')
    expect(drafts.get().new).toBe('half a thought')
  })

  it('shows what the provider said when a send fails', async () => {
    reply = async function* () {
      throw new Error('401 Unauthorized')
      yield ''
    }
    screenAt('/')
    await ask('hi')
    expect(await screen.findByTestId('chat-error')).toHaveTextContent('401 Unauthorized')
  })

  it('sends the user to settings when no provider is configured', async () => {
    active = null
    screenAt('/')
    expect(screen.getByTestId('notice-settings')).toBeInTheDocument()
    await ask('hi')
    expect(await screen.findByText('settings screen')).toBeInTheDocument()
    expect(chats.get()).toEqual([])
  })
})
