import { useSyncExternalStore } from 'react'
import { newId } from './id'

/** A tool waiting on you to answer it. */
export type Question = { readonly id: string; readonly question: string }

let pending: readonly Question[] = []
const waiting = new Map<string, (answer: string) => void>()
const listeners = new Set<() => void>()

const publish = (next: readonly Question[]) => {
  pending = next
  for (const listener of listeners) listener()
}

/**
 * The `ask` a tool is given. The call parks here until the chat screen hands an
 * answer back — the agent loop runs in this tab, so nothing times out waiting.
 */
export const askUser = (question: string): Promise<string> =>
  new Promise((resolve) => {
    const id = newId()
    waiting.set(id, resolve)
    publish([...pending, { id, question: String(question) }])
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
