import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  version: string;
  children: React.ReactNode;
}

export function LegalLayout({
  title,
  lastUpdated,
  version,
  children,
}: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--wk-surface-page)]">
      <header className="border-b border-[var(--wk-border-subtle)] bg-[var(--wk-surface-white)]">
        <div className="mx-auto max-w-[var(--wk-narrow-width)] px-4 md:px-6 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--wk-text-secondary)] hover:text-[var(--wk-text-primary)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to WeKruit Valet
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[var(--wk-narrow-width)] px-4 md:px-6 py-8 md:py-12">
        <div className="mb-8 md:mb-10">
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3 text-sm text-[var(--wk-text-secondary)]">
            <span>Version {version}</span>
            <span aria-hidden="true">·</span>
            <span>Last updated: {lastUpdated}</span>
          </div>
        </div>

        <div className="legal-prose">{children}</div>

        <footer className="mt-16 border-t border-[var(--wk-border-subtle)] pt-8">
          <p className="text-xs italic text-[var(--wk-text-tertiary)]">
            This document is a draft for internal review and development
            purposes. All legal language must be reviewed and approved by
            qualified legal counsel before use in production.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:gap-6 text-sm text-[var(--wk-text-secondary)]">
            <Link
              to="/legal/terms"
              className="hover:text-[var(--wk-text-primary)] transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              to="/legal/privacy"
              className="hover:text-[var(--wk-text-primary)] transition-colors"
            >
              Privacy Policy
            </Link>
            <a
              href="mailto:legal@wekruit.com"
              className="hover:text-[var(--wk-text-primary)] transition-colors"
            >
              legal@wekruit.com
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
