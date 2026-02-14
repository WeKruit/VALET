import { useEffect } from "react";
import { Mail } from "lucide-react";
import { PublicHeader } from "../components/public-header";
import { PublicFooter } from "../components/public-footer";

export function ContactPage() {
  useEffect(() => {
    document.title = "Contact - WeKruit Valet";
  }, []);

  return (
    <div className="min-h-screen bg-[var(--wk-surface-page)]">
      <PublicHeader />

      <section className="px-6 py-20 md:py-28">
        <div className="mx-auto max-w-[var(--wk-narrow-width)]">
          <div className="text-center">
            <p className="wk-caption text-[var(--wk-accent-amber)]">Contact</p>
            <h1 className="wk-display-lg mt-4 text-[var(--wk-text-primary)]">
              Get in touch
            </h1>
            <p className="wk-body-base mx-auto mt-4 max-w-lg text-[var(--wk-text-secondary)]">
              Have a question, found a bug, or want to share feedback? We'd love
              to hear from you.
            </p>
          </div>

          <div className="mx-auto mt-14 max-w-md">
            <div className="rounded-[var(--wk-radius-2xl)] border border-[var(--wk-border-default)] bg-[var(--wk-surface-card)] p-8 shadow-[var(--wk-shadow-md)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-surface-sunken)]">
                  <Mail className="h-5 w-5 text-[var(--wk-accent-amber)]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--wk-text-primary)]">
                    Email Us
                  </h3>
                  <a
                    href="mailto:hello@wekruit.com"
                    className="text-sm text-[var(--wk-text-secondary)] underline underline-offset-2 transition-colors hover:text-[var(--wk-text-primary)]"
                  >
                    hello@wekruit.com
                  </a>
                </div>
              </div>

              <div className="mt-6 border-t border-[var(--wk-border-subtle)] pt-6">
                <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
                  Response Time
                </h4>
                <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
                  We typically respond within 24 hours on business days.
                </p>
              </div>

              <div className="mt-6 border-t border-[var(--wk-border-subtle)] pt-6">
                <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
                  For Legal Inquiries
                </h4>
                <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
                  Reach our legal team at{" "}
                  <a
                    href="mailto:legal@wekruit.com"
                    className="underline underline-offset-2 transition-colors hover:text-[var(--wk-text-primary)]"
                  >
                    legal@wekruit.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
