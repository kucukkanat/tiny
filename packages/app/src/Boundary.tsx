import { Component, type ReactNode } from 'react'
import { Button } from '@tiny/ui'

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
        <p className="text-[13px] text-ink-3">Your chats are saved — reloading picks up where you were.</p>
        <Button variant="primary" data-testid="crash-reload" onClick={() => location.reload()}>
          Reload
        </Button>
      </div>
    )
  }
}
