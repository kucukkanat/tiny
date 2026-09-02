# @tiny/plugin-chat

Chat with whatever `@tiny/plugin-settings` points at, and every chat you've had
before. Calls the provider straight from the tab — no server in between.

Two pieces: `ChatScreen` at `/#/chat/:id`, and `ChatSidebar` in the shell's
sidebar listing the conversations.

`Composer` is the message box. It's local rather than AI Elements' `PromptInput`
because that one is 1,363 lines of attachments, screenshot paste and model
pickers this app doesn't have; what's left is a textarea and a button:

```tsx
<Composer
  placeholder={`Message ${provider.model}`}
  status={status} // from useChat: send icon, spinner, or stop square
  onSend={(text) => void sendMessage({ text })}
  onStop={() => void stop()}
/>
```

Enter sends, shift-Enter breaks the line, and neither fires while an IME
candidate is open.

The transport is the whole trick:

```ts
import { DirectChatTransport, ToolLoopAgent } from 'ai'
import { useChat } from '@ai-sdk/react'

const agent = new ToolLoopAgent({ model: languageModel(provider) })

const { messages, sendMessage, status } = useChat({
  transport: new DirectChatTransport({ agent }),
})
```

`DirectChatTransport` runs the agent in-process instead of POSTing to an API
route, which is what makes a browser-only chat possible. Everything else —
streaming, message parts, abort — is the SDK doing its normal job.

## Conversations

`conversations.ts` is a module-level store, not a context: the sidebar and the
screen are siblings under the shell and both need the same list, live.

```ts
import { saveConversation, removeConversation, useConversations } from './conversations'

const conversations = useConversations() // newest first, `undefined` while loading
```

Each conversation is its own `localStorage` key (`tiny.chat.<id>`), so saving one
doesn't re-serialise the whole history and two open tabs writing different
conversations don't overwrite each other. Everything read back is validated by
the SDK's own `safeValidateUIMessages`, so a transcript from an older build gets
dropped rather than crashing the screen. Reading takes a moment and a write can
land inside it — whatever was written while reading wins.

A conversation is named after the first thing you said in it, and is stamped
only when a message is added. Opening one to read it doesn't move it up the list.

An unsent message is state too, so it's kept under `tiny.draft.<id>` and restored
when you come back. Deleting a conversation takes its draft with it.

## Anthropic from a browser

`api.anthropic.com` refuses browser requests unless you send
`anthropic-dangerous-direct-browser-access: true`, which `languageModel` does.
It's named that for a reason: the key is in the page, readable by anything
running there. Fine for a local-first app on your own device, not for one you
hand to other people.
