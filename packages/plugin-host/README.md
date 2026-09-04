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

## Needing something a plugin doesn't own

A plugin never imports another plugin. If it needs something from outside — a
model to call, a component to slot in — it exports a factory that takes it, and
the app fills it in:

```ts
export const chat = (options: ChatOptions): Plugin => ({ id: 'chat', ... })
```

Chat is the one that does this today. It gets its model from settings and its
tools from tools, and knows about neither.

## Extensions

The other kind of feature. A `Plugin` is built into the app; an `Extension` is
installed into it at runtime, from a URL. Both are features, so both contracts
live here — this is the one package with nothing behind it.

```ts
import type { Extension, Tiny } from '@tiny/plugin-host'

export default (tiny: Tiny): Extension => ({
  id: 'dice', // renders under /#/dice, and must not be a name the app took
  title: 'Dice',
  tools: { roll: /* ... */ },
})
```

An `Extension` is a `Plugin` whose `Screen` is optional — a tools-only extension
has no screen — plus `tools`, `providers`, `actions`, `instructions` and `css`.
`Tiny` is what the app hands it: `useChats`, `useModel`, `ask`. Both are written
out in full in `src/index.ts`; `@tiny/plugin-extensions` is what loads them.

Extension authors outside this repo install this package for the types, and
nothing from it ends up in their build.

## Not only types

Three things every feature needs and none of them may import from each other:

```tsx
import { Safely, isToolName, write } from '@tiny/plugin-host'

;<Safely name="Chat">
  <Screen />
</Safely> // one throw used to empty the whole app
write('tiny.thing', json) // false when storage is full, never a throw
isToolName(name) // what a provider will accept, and a model call
```

`Safely` is the shell's error boundary. React unmounts the entire root on an
uncaught render error, so without it one bad screen takes the sidebar and every
other feature with it — and since the route is in the hash, reloading lands right
back on it.
