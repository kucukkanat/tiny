import { Component, type ReactNode } from 'react'
import { Button } from '@tiny/ui'

/**
 * Reload from a clean slate. A half-updated service worker survives an ordinary
 * refresh and is a common reason a deploy breaks one browser and no others;
 * chats and keys live in localStorage and are left alone.
 */
async function reset() {
  const workers = (await navigator.serviceWorker?.getRegistrations()) ?? []
  await Promise.all(workers.map((w) => w.unregister()))
  if (globalThis.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  location.reload()
}

/** A crash below here shows what went wrong instead of an empty page. */
export class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-start gap-4 px-4 py-10 sm:px-8" data-testid="crash">
        <h1 className="text-[20px] font-medium text-ink">Something broke</h1>
        <p className="w-full whitespace-pre-wrap break-words rounded-card bg-red-tint px-3 py-2 font-mono text-[12.5px] text-red">
          {error.message || String(error)}
        </p>
        {error.stack && (
          <details className="w-full">
            <summary className="cursor-pointer text-[13px] text-ink-3">Details</summary>
            <pre className="mt-2 w-full overflow-x-auto rounded-card bg-field p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">
              {error.stack}
            </pre>
          </details>
        )}
        <p className="text-[13px] text-ink-3">Your chats are saved — reloading picks up where you were.</p>
        <Button variant="primary" data-testid="crash-reload" onClick={reset}>
          Reload
        </Button>
      </div>
    )
  }
}
