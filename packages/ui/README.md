# @tiny/ui

Design tokens and every component the app uses. Extensions in the build import
from here; nothing else touches the registries.

```tsx
import { Input } from '@tiny/ui/components/input'
import { cn } from '@tiny/ui/lib/utils'

export const Field = ({ wide }: { wide: boolean }) => (
  <Input data-testid="field" className={cn('h-12', wide && 'w-full')} />
)
```

## Adding a component

Run these from `packages/ui`. They land in `src/components/` and rewrite their
own imports to `@tiny/ui/*`.

```sh
bun x shadcn@latest add popover         # general UI
bun x ai-elements@latest add reasoning  # AI UI, from the Vercel AI SDK registry
```

Add a component when an extension needs it, not before.

## Written here, not installed

[beautifului.dev](https://beautifului.dev/) is the visual target and it ships no
code — no registry, no package. What it showcases and the app has a use for is
written here from its rendered markup, on our tokens.

`Loading` is its pixel-grid loader: nine cells on one keyframe, offset by where
the cell sits. The clock is the point — a shimmer alone can't tell you it's
still going rather than stuck. `Shimmer` is the text half on its own.

```tsx
import { Loading, Shimmer } from '@tiny/ui/components/loading'

<Loading label="Thinking" seconds={4.2} /> // pixels, shimmer, 4.2s
<Loading label="Asking the endpoint" />    // no clock when nothing is timing it
<summary>{busy ? <Shimmer>weather</Shimmer> : 'weather'}</summary>
```

`CodeBlock` is a listing with a name on it, numbers down the side and a copy
button. It wraps rather than scrolls, so a long line stays readable on a phone.

```tsx
import { CodeBlock } from '@tiny/ui/components/code-block'

;<CodeBlock label="Input" code={JSON.stringify({ city: 'Istanbul' }, null, 2)} />
```

`useCopy` is the copy-and-say-so behind both that button and the one under a
reply. The confirmation is shown for a moment rather than hovered into view,
because there is no hover on a phone.

```tsx
import { useCopy } from '@tiny/ui/hooks/use-copy'

const [copied, copy] = useCopy()
<button onClick={() => copy(text)}>{copied ? 'Copied' : 'Copy'}</button>
```

## Theme

Dark first. `lib/theme.ts` owns the choice and the `.dark` class every token
hangs off — nothing else touches it.

```ts
import { applyTheme, readTheme, useTheme, watchSystemTheme } from '@tiny/ui/lib/theme'

applyTheme(readTheme()) // at boot, before React renders
watchSystemTheme() // once, so `system` follows the OS from anywhere in the app
const [theme, setTheme] = useTheme() // 'dark' | 'light' | 'system'
```

Nothing stored means dark, not whatever the OS prefers. `applyTheme` also moves
the `theme-color` meta tag, and `color-scheme` follows the same class, so native
scrollbars and mobile browser chrome match.

## Tokens

All of them live in `src/styles/globals.css` as Tailwind v4 `@theme` custom
properties — colour, type, spacing, radius, elevation and motion. Restyling the
app is editing that one file.

The palette is [beautifului.dev](https://beautifului.dev/)'s, which is the visual
target. Surfaces run back to front — `page`, `canvas`, `surface`, `inset` — text
runs loud to quiet as `ink`, `ink-2`, `ink-3`, and there is one blue, `brand`.

```tsx
<div className="bg-surface text-ink shadow-card rounded-window p-4">
  <p className="text-ink-2 text-sm">Quieter than the line above it.</p>
</div>
```

shadcn's names are aliases onto those, so `bg-background` and `bg-page` are the
same colour and a registry component picks up the look without being edited.
Note `--accent` is shadcn's meaning — a hover surface — and the blue is `--brand`.

Radii are named for what they wrap: `chip` 6px, `control` 8px, `card` 10px,
`window` 14px. Elevation is always a hairline plus a shadow (`shadow-card`,
`shadow-raised`, `shadow-overlay`), never a bare shadow. `--spacing-control` is
the height every form control shares, so a select and the button beside it line
up without anyone guessing.
