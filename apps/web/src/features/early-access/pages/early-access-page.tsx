import { useAuth } from "@/features/auth/hooks/use-auth";
import { Button } from "@valet/ui/components/button";
import { Card, CardContent } from "@valet/ui/components/card";
import { Clock, Sparkles, Mail } from "lucide-react";

export function EarlyAccessPage() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
      <div className="mx-auto w-full max-w-md space-y-8 px-4">
        {/* Logo */}
        <div className="flex flex-col items-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-text-primary)]">
            <span className="text-2xl font-bold text-[var(--wk-surface-page)]">V</span>
          </div>
          <div className="text-center">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              You're on the waitlist!
            </h1>
            <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
              Thanks for joining, {user?.name ?? "there"}. We're rolling out access in waves.
            </p>
          </div>
        </div>

        {/* Info card */}
        <Card className="border-[var(--wk-border-subtle)] bg-[var(--wk-surface-white)] shadow-[var(--wk-shadow-md)]">
          <CardContent className="space-y-6 p-6">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-accent-amber)]/10">
                <Clock className="h-5 w-5 text-[var(--wk-accent-amber)]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--wk-text-primary)]">Sit tight</p>
                <p className="mt-0.5 text-sm text-[var(--wk-text-secondary)]">
                  We'll email you at {user?.email} when your access is ready.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-accent-amber)]/10">
                <Sparkles className="h-5 w-5 text-[var(--wk-accent-amber)]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--wk-text-primary)]">
                  What to expect
                </p>
                <p className="mt-0.5 text-sm text-[var(--wk-text-secondary)]">
                  AI-powered job applications, resume parsing, multi-platform support, and more.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-accent-amber)]/10">
                <Mail className="h-5 w-5 text-[var(--wk-accent-amber)]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--wk-text-primary)]">
                  Check your inbox
                </p>
                <p className="mt-0.5 text-sm text-[var(--wk-text-secondary)]">
                  We sent a confirmation to {user?.email}. Add us to your contacts.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sign out */}
        <div className="flex justify-center">
          <Button variant="ghost" onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
