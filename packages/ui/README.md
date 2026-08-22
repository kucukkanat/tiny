# @tiny/ui

The [Beautiful UI](https://beautifului.dev) primitives this app is built from,
plus the design tokens behind them. Mobile-first: touch targets are full size
below `sm` and tighten up on a desktop.

```tsx
import { Message, PromptBar, SidebarRow, Thinking } from '@tiny/ui'

<SidebarRow icon="newChat" label="New chat" onClick={start} data-testid="chat-new" />

<Message role="user">Compare mint chip to last summer</Message>
<Thinking />
<Message role="assistant">Mint chip is up 12% year over year.</Message>

<PromptBar
  value={draft}
  onChange={setDraft}
  onSubmit={send}
  onStop={abort}
  busy={streaming}
  models={['gpt-5', 'gpt-4o']}
  model={model}
  onModelChange={setModel}
/>
```

Also here: `Button`, `IconButton`, `Input`, `Select`, `Field`, `Icon`.

## Tokens

`tokens.css` defines the palette, radii and shadows as Tailwind theme variables —
`bg-page`, `text-ink-2`, `border-line`, `shadow-card`, `rounded-window` — in a
light set and a dark override under `.dark`. Import it after Tailwind:

```css
@import "tailwindcss";
@import "@tiny/ui/tokens.css";
```

Nothing here reads colours directly; change a token and the whole app follows.
