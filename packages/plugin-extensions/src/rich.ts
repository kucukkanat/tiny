import type { PrismEditor } from 'prism-code-editor'
import { useEffect, useState, type ComponentType } from 'react'

export type RichEditorProps = {
  readonly value: string
  readonly onChange: (source: string) => void
  /** The editor, once it exists — how a test asks it what it would offer. */
  readonly onReady?: (editor: PrismEditor) => void
}

/**
 * The editor, once it has arrived. It is a few hundred milliseconds and 18 kB
 * that nobody who never opens an extension should pay, so it is fetched here
 * rather than imported.
 *
 * A plain `import()` and not `React.lazy`: a chunk that fails to load is
 * remembered as failed for the life of the document, so there is no retry worth
 * offering — and `React.lazy` would take the screen down with it. Undefined
 * means the plain box below is what you get, which is the whole feature minus
 * the colour.
 */
type Loaded = { readonly RichEditor: ComponentType<RichEditorProps> }

export const useRichEditor = (): Loaded | undefined => {
  const [loaded, setLoaded] = useState<Loaded>()

  useEffect(() => {
    let live = true
    void import('./editor').then(
      (module) => live && setLoaded(module),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])

  return loaded
}
