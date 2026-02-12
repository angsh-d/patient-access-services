import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
  className?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Lightweight error boundary for individual page sections.
 * Catches render errors without crashing the entire page.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('SectionErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={`bg-white rounded-xl border border-grey-200 p-6 ${this.props.className || ''}`}>
          <div className="flex items-center gap-3 text-grey-600 mb-3">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-sm font-semibold">
              {this.props.fallbackTitle || 'Something went wrong'}
            </h3>
          </div>
          <p className="text-xs text-grey-500 mb-4">
            This section encountered an error. Other sections are unaffected.
          </p>
          {this.state.error && (
            <details className="mb-4">
              <summary className="text-xs text-grey-400 cursor-pointer hover:text-grey-600">
                Error details
              </summary>
              <pre className="mt-2 p-2 bg-grey-50 rounded-lg text-xs text-grey-500 overflow-auto max-h-24">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1.5 text-xs font-medium bg-grey-100 text-grey-700 rounded-lg hover:bg-grey-200 transition-colors"
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default SectionErrorBoundary
