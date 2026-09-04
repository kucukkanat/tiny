import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  /** What to say crashed. */
  readonly name: string
  /** Change this to try again — the shell passes the route. */
  readonly resetKey?: string
  readonly children: ReactNode
}

type State = { readonly error: Error | null; readonly resetKey?: string }

/**
 * React unmounts the whole root on an uncaught render or effect error, so one
 * bad screen would otherwise take the sidebar, the header and every other
 * feature with it — and since the route is in the hash, reloading lands right
 * back on it. This stops that at the feature boundary.
 *
 * There is nothing to click: navigating away is the way out, and the shell is
 * still there to navigate with.
 */
export class Safely extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  // Leaving the screen clears the error, so coming back tries again.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey
      ? null
      : { error: null, resetKey: props.resetKey }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.name} crashed`, error, info.componentStack)
  }

  override render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <p className="text-destructive p-4 text-sm" data-testid="crashed">
        {this.props.name} crashed: {error.message}
      </p>
    )
  }
}
