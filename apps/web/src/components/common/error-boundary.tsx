import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
          <div className="mx-auto max-w-md space-y-4 px-4 text-center">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-[var(--wk-radius-2xl)] bg-red-100 text-red-600">
              <span className="text-2xl">!</span>
            </div>
            <h1 className="font-display text-xl font-semibold">
              Something went wrong
            </h1>
            <p className="text-sm text-[var(--wk-text-secondary)]">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            {this.state.error && (
              <pre className="mt-4 max-h-32 overflow-auto rounded-[var(--wk-radius-lg)] bg-[var(--wk-surface-raised)] p-3 text-left text-xs text-[var(--wk-text-tertiary)]">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-text-primary)] px-4 py-2 text-sm font-medium text-[var(--wk-surface-page)] hover:opacity-90 transition-opacity"
            >
              Refresh page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
