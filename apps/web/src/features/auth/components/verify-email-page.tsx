import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const calledRef = useRef(false);

  const verifyMutation = api.auth.verifyEmail.useMutation();

  useEffect(() => {
    if (token && !calledRef.current) {
      calledRef.current = true;
      verifyMutation.mutate({ body: { token } });
    }
  }, [token]);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
        <div className="mx-auto w-full max-w-sm space-y-8 px-4">
          <div className="rounded-[var(--wk-radius-2xl)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-white)] p-6 shadow-[var(--wk-shadow-md)]">
            <div className="space-y-4 text-center">
              <h2 className="text-lg font-semibold">Invalid link</h2>
              <p className="text-sm text-[var(--wk-text-secondary)]">
                This verification link is invalid or missing.
              </p>
              <Link
                to="/login"
                className="mt-4 inline-block text-sm font-medium text-[var(--wk-text-primary)] underline underline-offset-2 hover:text-[var(--wk-text-secondary)] transition-colors"
              >
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (verifyMutation.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
        <div className="mx-auto w-full max-w-sm space-y-8 px-4">
          <div className="flex flex-col items-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-text-primary)]">
              <span className="text-2xl font-bold text-[var(--wk-surface-page)]">V</span>
            </div>
          </div>
          <div className="rounded-[var(--wk-radius-2xl)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-white)] p-6 shadow-[var(--wk-shadow-md)]">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--wk-text-secondary)]" />
              <p className="text-sm text-[var(--wk-text-secondary)]">
                Verifying your email...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (verifyMutation.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
        <div className="mx-auto w-full max-w-sm space-y-8 px-4">
          <div className="flex flex-col items-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-text-primary)]">
              <span className="text-2xl font-bold text-[var(--wk-surface-page)]">V</span>
            </div>
          </div>
          <div className="rounded-[var(--wk-radius-2xl)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-white)] p-6 shadow-[var(--wk-shadow-md)]">
            <div className="space-y-4 text-center">
              <h2 className="text-lg font-semibold">Verification failed</h2>
              <p className="text-sm text-[var(--wk-text-secondary)]">
                This verification link may have expired or already been used.
              </p>
              <Link
                to="/login"
                className="mt-4 inline-block text-sm font-medium text-[var(--wk-text-primary)] underline underline-offset-2 hover:text-[var(--wk-text-secondary)] transition-colors"
              >
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
      <div className="mx-auto w-full max-w-sm space-y-8 px-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-text-primary)]">
            <span className="text-2xl font-bold text-[var(--wk-surface-page)]">V</span>
          </div>
        </div>
        <div className="rounded-[var(--wk-radius-2xl)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-white)] p-6 shadow-[var(--wk-shadow-md)]">
          <div className="space-y-4 text-center">
            <h2 className="text-lg font-semibold">Email verified</h2>
            <p className="text-sm text-[var(--wk-text-secondary)]">
              Your email has been verified successfully. You can now sign in to your account.
            </p>
            <Link
              to="/login"
              className="mt-4 inline-block text-sm font-medium text-[var(--wk-text-primary)] underline underline-offset-2 hover:text-[var(--wk-text-secondary)] transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
