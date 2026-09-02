import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { Provider } from '@tiny/plugin-settings'
import { ToolLoopAgent, type InferAgentUIMessage, type LanguageModel } from 'ai'

/** The configured endpoint as a model the SDK can call, straight from the tab. */
const languageModel = (provider: Provider): LanguageModel =>
  provider.kind === 'anthropic'
    ? createAnthropic({
        baseURL: provider.baseUrl,
        apiKey: provider.apiKey,
        // without this the browser is refused outright
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })(provider.model)
    : createOpenAICompatible({
        name: 'openai',
        baseURL: provider.baseUrl,
        apiKey: provider.apiKey,
      })(provider.model)

export const agentFor = (provider: Provider) =>
  new ToolLoopAgent({ model: languageModel(provider) })

export type ChatMessage = InferAgentUIMessage<ReturnType<typeof agentFor>>

/** Everything a message said out loud, with the non-text parts left out. */
export const textOf = (parts: ChatMessage['parts']): string =>
  parts.map((part) => (part.type === 'text' ? part.text : '')).join('')
