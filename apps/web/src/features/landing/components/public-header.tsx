import { Link } from "react-router-dom";
import { Button } from "@valet/ui/components/button";
import { useAuth } from "@/features/auth/hooks/use-auth";

export function PublicHeader() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[var(--wk-max-width)] items-center justify-between px-4 md:px-6 py-3 md:py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--wk-radius-xl)] bg-[var(--wk-text-primary)]">
            <span className="text-base font-bold text-[var(--wk-surface-page)]">
              V
            </span>
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">
            WeKruit Valet
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link
            to="/about"
            className="text-sm text-[var(--wk-text-secondary)] transition-colors hover:text-[var(--wk-text-primary)]"
          >
            About
          </Link>
          <Link
            to="/pricing"
            className="text-sm text-[var(--wk-text-secondary)] transition-colors hover:text-[var(--wk-text-primary)]"
          >
            Pricing
          </Link>
          <Link
            to="/contact"
            className="text-sm text-[var(--wk-text-secondary)] transition-colors hover:text-[var(--wk-text-primary)]"
          >
            Contact
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <Button asChild size="sm" variant="cta">
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" variant="cta" className="hidden sm:inline-flex">
                <Link to="/login">Get Started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
