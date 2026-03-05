import { useState } from "react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Button } from "@valet/ui/components/button";
import { Card, CardContent } from "@valet/ui/components/card";
import { Clock, Sparkles, Mail, Copy, Check, Share2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

export function EarlyAccessPage() {
  const { user, logout } = useAuth();
  const [copied, setCopied] = useState(false);

  const referralQuery = api.referrals.getMyReferral.useQuery({
    queryKey: ["referrals", "me", user?.id],
    queryData: {},
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const referralData = referralQuery.data?.status === 200 ? referralQuery.data.body : null;
  const referralLink = referralData?.code
    ? `${window.location.origin}/login?ref=${referralData.code}`
    : null;

  function handleCopyLink() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleCopyCode() {
    if (!referralData?.code) return;
    navigator.clipboard.writeText(referralData.code).then(() => {
      toast.success("Referral code copied!");
    });
  }

  function handleEmailShare() {
    if (!referralLink) return;
    const subject = encodeURIComponent("Try WeKruit Valet");
    const body = encodeURIComponent(
      `Hey! I'm using WeKruit Valet for AI-powered job applications. Sign up with my referral link and we both get bonus credits:\n\n${referralLink}`,
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
      <div className="mx-auto w-full max-w-md space-y-6 px-4">
        {/* Logo */}
        <div className="flex flex-col items-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-text-primary)]">
            <span className="text-2xl font-bold text-[var(--wk-surface-page)]">V</span>
          </div>
          <div className="text-center">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              You're on the early access list
            </h1>
            <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
              Thanks for joining, {user?.name ?? "there"}. We're rolling out access in waves.
            </p>
          </div>
        </div>

        {/* Referral card */}
        {referralData && (
          <Card className="border-[var(--wk-border-subtle)] bg-[var(--wk-surface-white)] shadow-[var(--wk-shadow-md)]">
            <CardContent className="space-y-4 p-6">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <Share2 className="h-5 w-5 text-[var(--wk-accent-amber)]" />
                  <p className="text-sm font-semibold text-[var(--wk-text-primary)]">
                    Refer friends, earn credits
                  </p>
                </div>
                <p className="mt-1 text-xs text-[var(--wk-text-secondary)]">
                  Each friend who completes a task earns you 25 bonus credits.
                </p>
              </div>

              {/* Referral code */}
              <div className="flex items-center justify-between rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)] px-4 py-3">
                <span className="font-mono text-lg font-bold tracking-widest text-[var(--wk-text-primary)]">
                  {referralData.code}
                </span>
                <Button variant="ghost" size="sm" onClick={handleCopyCode}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              {/* Stats */}
              <div className="flex justify-center gap-6 text-center text-xs text-[var(--wk-text-secondary)]">
                <div>
                  <p className="text-lg font-bold text-[var(--wk-text-primary)]">
                    {referralData.totalReferred}
                  </p>
                  <p>Referred</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--wk-text-primary)]">
                    {referralData.activatedCount + referralData.rewardedCount}
                  </p>
                  <p>Completed</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--wk-text-primary)]">
                    {referralData.pendingCount}
                  </p>
                  <p>Pending</p>
                </div>
              </div>

              {/* Share buttons */}
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={handleCopyLink}>
                  {copied ? (
                    <Check className="mr-1.5 h-4 w-4" />
                  ) : (
                    <Copy className="mr-1.5 h-4 w-4" />
                  )}
                  {copied ? "Copied!" : "Copy link"}
                </Button>
                <Button variant="secondary" size="sm" className="flex-1" onClick={handleEmailShare}>
                  <Mail className="mr-1.5 h-4 w-4" />
                  Email invite
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

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
