import { useSyncExternalStore } from 'react'
import { newId } from './installed'

/** A tool waiting on you to answer it, and what it offered to choose from. */
export type Question = {
  readonly id: string
  readonly question: string
  readonly options: readonly string[]
}

let pending: readonly Question[] = []
const waiting = new Map<string, (answer: string) => void>()
const listeners = new Set<() => void>()

const publish = (next: readonly Question[]) => {
  pending = next
  for (const listener of listeners) listener()
}

/**
 * The `ask` every extension is handed as `tiny.ask`. The call parks here until
 * the chat screen hands an answer back — the agent loop runs in this tab, so
 * nothing times out waiting.
 *
 * Both arguments come from an extension, which is somebody else's code, so
 * neither is trusted to be the shape it should be: whatever arrives is coerced,
 * not validated.
 */
export const askUser = (question: string, options?: unknown): Promise<string> =>
  new Promise((resolve) => {
    const id = newId()
    waiting.set(id, resolve)
    publish([
      ...pending,
      {
        id,
        question: String(question),
        options: Array.isArray(options) ? options.map(String) : [],
      },
    ])
  })

export const answerQuestion = (id: string, answer: string) => {
  waiting.get(id)?.(answer)
  waiting.delete(id)
  publish(pending.filter((one) => one.id !== id))
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Every question a tool is still waiting on. */
export const useQuestions = (): readonly Question[] =>
  useSyncExternalStore(subscribe, () => pending)
