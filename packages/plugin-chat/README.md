# @tiny/plugin-chat

The chat itself: the conversation screen, the composer, and the chat list in the
sidebar.

```ts
import { chatPlugin } from '@tiny/plugin-chat'
// routes: '/' (new chat) and '/c/:id'; sidebar: New chat + previous chats
```

Chats and unsent drafts live in [`@tiny/store`](../store), so a reload lands
exactly where you left off — same conversation, same half-typed message.

A reply streams into the trailing assistant message token by token and is written
to storage as it goes. The `AbortController` for a live stream is held outside the
component, so switching chats mid-reply doesn't cut it off, and coming back shows
it still running.
