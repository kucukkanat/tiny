# @tiny/store

A JSON value in `localStorage`, readable as a React store. Survives reload, stays
in sync across tabs, and falls back to the initial value when storage is broken
or full.

```tsx
import { persisted, useStore } from '@tiny/store'

const notes = persisted<string[]>('notes', [])

function Notes() {
  const list = useStore(notes)
  return (
    <button onClick={() => notes.set((prev) => [...prev, 'another'])}>
      {list.length} notes
    </button>
  )
}
```

Writes are coalesced: `get` and subscribers see a new value immediately, and
storage catches up once the burst settles (a pending write is flushed on
`pagehide`). A reply streaming in token by token therefore costs a handful of
writes, not one per token — which matters, because each write re-serialises
everything under that key.

`persisted` returns `{ get, set, subscribe }`, so anything outside React can read
and write the same value — `notes.get()` in an event handler, `notes.set(...)`
from a stream.
