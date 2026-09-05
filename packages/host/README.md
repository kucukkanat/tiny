# @tiny/host

The contract every feature is written against. One type however it arrives.

```ts
import type { Extension, ExtensionModule, Tiny } from '@tiny/host'

export default ((tiny) => ({
  id: 'dice', // renders under /#/dice, and must not be a name already taken
  title: 'Dice', // its label in the shell
  tools: { roll: /* ... */ },
})) satisfies ExtensionModule
```

That is the whole of it. A module that ships in this build is listed in
`packages/app/src/extensions.tsx`; one that doesn't is `import()`ed in the tab
when someone installs it. The registry calls both the same way, with the same
`tiny`, and folds what they register into one list.

The shell renders `Screen` under `/#/<id>`. Everything below that is the
extension's own routing — chat uses it to get `/#/chat/:id`.

## Filling the sidebar

One with a list worth keeping on screen exports a `Sidebar` too, and the shell
renders it in the sidebar body:

```ts
export default ((tiny) => ({
  id: 'chat',
  title: 'Chat',
  Screen: ChatScreen,
  Sidebar: ChatSidebar, // the conversations you've had
})) satisfies ExtensionModule
```

One without gets a link in the sidebar footer instead; one already sitting in the
body doesn't need a link to itself.

## What it can hand over, and what it gets back

`Extension` is `id`, `title`, an optional `Screen` and `Sidebar`, plus `tools`,
`providers`, `actions`, `messageActions`, `instructions` and `css`. `Tiny` is the
other direction — the platform it didn't bring, and the fold of what everyone
else registered:

```ts
tiny.useChats() //  every conversation, newest first
tiny.useModel() //  the configured model, or undefined
tiny.ask(q, []) //  puts a question in the chat, waits for the answer
tiny.useTools() //  every tool the model may call, yours included
tiny.useInstructions() //  the whole system prompt
tiny.useActions() //       every action on a highlighted reply
tiny.useMessageActions() // every button under a message
tiny.useProviders() //     every dialect on offer
```

A tool can draw its own result rather than leaving it as JSON. `View` is a
component hung on the tool itself, handed `{ input, output }` once the call has
come back — so whichever extension won the tool's name won the drawing with it,
and switching that extension off takes both away together.

```ts
tools: {
  chart: { ...tool({ description, inputSchema, execute }), View: Bars },
}
```

Both are written out in full in `src/index.ts`. `Tiny` only ever grows: a module
already sitting in someone's `localStorage` is bound to the shape it was written
against, and there is no migration that reaches it.

## Never importing a sibling

An extension never imports another extension. If it needs something from outside
it takes it from `tiny`, and if that isn't there yet the answer is a new member
on `Tiny`, not a dependency. `extensions.test.ts` fails the build if an
`extension-*` package depends on another `@tiny/extension-*`.

This package is outside that namespace on purpose: it is not an extension, it is
what they are extensions to, so it is the one both deliveries may depend on.

## What being in the build buys you

Imports, and nothing else. A bundled extension is in the app's module graph, so
it can reach `@tiny/ui`, an `@ai-sdk/*` provider, anything in the workspace. One
that arrives at runtime gets `react`, `react/jsx-runtime`, `react-router`, `zod`
and `ai` through the page's import map, and no relative imports at all — a blob
has no base to resolve against.

Extension authors outside this repo install this package for the types, and
nothing from `.` ends up in their build.

## Not only types

Three things every feature needs and none of them may import from each other:

```tsx
import { Safely, isToolName, write } from '@tiny/host'

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

## `@tiny/host/app`

A second entry, for the app only: the model-selection store (`useProvider`,
`readModels`, `isUsable`…) and the question queue behind `tiny.ask`
(`askUser`, `useQuestions`). They are single instances or they are nothing — a
second copy of `ask` is a question nothing is waiting on — and `@tiny/host` is
not on the import map, so anything arriving at runtime would get its own. Use
`tiny` from there; this entry is for the features compiled into the bundle.
