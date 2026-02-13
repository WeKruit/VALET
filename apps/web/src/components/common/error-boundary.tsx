import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack ?? undefined } },
    });
  }

  private handleReturnHome = () => {
    this.setState({ hasError: false });
    window.location.href = "/";
  };

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
              An unexpected error occurred. Our team has been notified and is
              looking into it. Please try again.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-default)] bg-[var(--wk-surface-white)] px-4 py-2 text-sm font-medium text-[var(--wk-text-primary)] hover:bg-[var(--wk-surface-raised)] transition-colors"
              >
                Refresh page
              </button>
              <button
                onClick={this.handleReturnHome}
                className="inline-flex items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-text-primary)] px-4 py-2 text-sm font-medium text-[var(--wk-surface-page)] hover:opacity-90 transition-opacity"
              >
                Return to dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
