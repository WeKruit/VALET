import { Link } from "react-router-dom";

export function PublicFooter() {
  return (
    <footer className="border-t border-[var(--wk-border-subtle)] bg-[var(--wk-surface-raised)]">
      <div className="mx-auto max-w-[var(--wk-max-width)] px-4 md:px-6 py-8 md:py-12">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-text-primary)]">
                <span className="text-sm font-bold text-[var(--wk-surface-page)]">
                  V
                </span>
              </div>
              <span className="font-display text-lg font-semibold">
                WeKruit Valet
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--wk-text-secondary)]">
              AI-powered job application automation. Apply smarter, land faster.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
              Product
            </h4>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/pricing"
                  className="text-sm text-[var(--wk-text-secondary)] transition-colors hover:text-[var(--wk-text-primary)]"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  to="/login"
                  className="text-sm text-[var(--wk-text-secondary)] transition-colors hover:text-[var(--wk-text-primary)]"
                >
                  Sign In
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
              Company
            </h4>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/about"
                  className="text-sm text-[var(--wk-text-secondary)] transition-colors hover:text-[var(--wk-text-primary)]"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="text-sm text-[var(--wk-text-secondary)] transition-colors hover:text-[var(--wk-text-primary)]"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
              Legal
            </h4>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/legal/terms"
                  className="text-sm text-[var(--wk-text-secondary)] transition-colors hover:text-[var(--wk-text-primary)]"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/privacy"
                  className="text-sm text-[var(--wk-text-secondary)] transition-colors hover:text-[var(--wk-text-primary)]"
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-[var(--wk-border-subtle)] pt-6">
          <p className="text-center text-xs text-[var(--wk-text-tertiary)]">
            &copy; {new Date().getFullYear()} WeKruit, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
