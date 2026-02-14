import * as React from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/use-auth";

interface AdminGuardProps {
  children: React.ReactNode;
}

/** Restricts access to users with admin or superadmin role. Shows 404 for non-admins. */
export function AdminGuard({ children }: AdminGuardProps) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "admin" && user.role !== "superadmin") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="mx-auto max-w-md space-y-4 px-4 text-center">
          <p className="font-display text-6xl font-bold text-[var(--wk-text-tertiary)]">
            404
          </p>
          <h1 className="font-display text-xl font-semibold">Page not found</h1>
          <p className="text-sm text-[var(--wk-text-secondary)]">
            The page you are looking for does not exist or has been moved.
          </p>
          <Link
            to="/dashboard"
            className="mt-4 inline-flex items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-text-primary)] px-4 py-2 text-sm font-medium text-[var(--wk-surface-page)] hover:opacity-90 transition-opacity"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
