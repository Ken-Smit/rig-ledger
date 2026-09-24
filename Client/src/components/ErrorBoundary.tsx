import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

// Catches render-phase errors anywhere below it and shows a recovery screen
// instead of a blank page.
//
// A class component because componentDidCatch has no hook equivalent.
//
// LIMITS: render-phase only. Errors thrown from event handlers, async
// rejections, or effect callbacks after paint do NOT reach this — those still
// need their own try/catch at the call site.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console only — there is no error-reporting service wired up yet, so a
    // crash reaches the developer only if the user reports it.
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="crash-screen" role="alert">
        <div className="crash-card">
          <h1>Something went wrong</h1>
          <p>
            The page ran into an error and stopped. Your saved entries are safe — nothing
            was lost. Reloading usually clears it.
          </p>
          <div className="crash-actions">
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Reload Page
            </button>
            <button
              className="btn-ghost"
              onClick={() => { window.location.href = '/dashboard' }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }
}
