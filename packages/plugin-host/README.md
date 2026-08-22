# @tiny/plugin-host

The contract between the shell and a feature. One type, no runtime code.

```ts
import type { Plugin } from '@tiny/plugin-host'
import { Timer } from './timer'

export const timer: Plugin = {
  id: 'timer', // renders under /#/timer
  title: 'Timer', // its label in the shell
  Screen: Timer,
}
```

The shell renders `Screen` under `/#/<id>`. Everything below that is the
plugin's own routing — chat uses it to get `/#/chat/:id`.

## Filling the sidebar

A plugin that has a list worth keeping on screen exports a `Sidebar` too, and
the shell renders it in the sidebar body:

```ts
export const chat: Plugin = {
  id: 'chat',
  title: 'Chat',
  Screen: ChatScreen,
  Sidebar: ChatSidebar, // the conversations you've had
}
```

Plugins without one get a link in the sidebar footer instead; a plugin already
sitting in the body doesn't need a link to itself.

That's the whole extension point — it grows only when a plugin needs a hook it
can't get today.
