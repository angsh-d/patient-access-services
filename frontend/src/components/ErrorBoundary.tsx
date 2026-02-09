import { Component, type ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary component to catch React errors and display a fallback UI
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Error boundary caught error:', error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <Card variant="default" padding="lg" className="max-w-md w-full text-center">
            <CardContent>
              <div className="w-12 h-12 rounded-full bg-semantic-error/10 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6 text-semantic-error" />
              </div>
              <h2 className="text-lg font-semibold text-grey-900 mb-2">
                Something went wrong
              </h2>
              <p className="text-sm text-grey-500 mb-6">
                An unexpected error occurred. Please try again or reload the page.
              </p>
              {this.state.error && (
                <details className="mb-6 text-left">
                  <summary className="text-xs text-grey-400 cursor-pointer hover:text-grey-600">
                    Error details
                  </summary>
                  <pre className="mt-2 p-3 bg-grey-100 rounded-lg text-xs text-grey-600 overflow-auto max-h-32">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
              <div className="flex gap-3 justify-center">
                <Button
                  variant="secondary"
                  onClick={this.handleReset}
                >
                  Try Again
                </Button>
                <Button
                  variant="primary"
                  onClick={this.handleReload}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
