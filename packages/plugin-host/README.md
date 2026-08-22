# @tiny/plugin-host

The contract between the shell and a feature. One type, no runtime code.

```ts
import type { Plugin } from '@tiny/plugin-host'
import { Timer } from './timer'

export const timer: Plugin = {
  id: 'timer', // renders at /#/timer
  title: 'Timer', // its label in the nav
  Screen: Timer,
}
```

The shell renders `Screen` at `/#/<id>` and `title` in the nav. That's the whole
extension point — it grows only when a plugin needs a hook it can't get today.
