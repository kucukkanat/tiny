# @tiny/ui

Design tokens and every component the app uses. Plugins import from here;
nothing else touches the registries.

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
bun x shadcn@latest add dialog          # general UI
bun x ai-elements@latest add reasoning  # AI UI, from the Vercel AI SDK registry
```

Add a component when a plugin needs it, not before.

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
properties — colour, type, spacing, radius, shadow, motion. Restyling the app is
editing that one file. `--spacing-control` is the height every form control
shares, so a select and the button beside it line up without anyone guessing.
[beautifului.dev](https://beautifului.dev/) is the target.
