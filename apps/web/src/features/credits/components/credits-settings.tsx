import { useState, useRef, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Badge } from "@valet/ui/components/badge";
import { Input } from "@valet/ui/components/input";
import { Skeleton } from "@valet/ui/components/skeleton";
import {
  Coins,
  Copy,
  Check,
  Share2,
  Mail,
  Users,
  ChevronLeft,
  ChevronRight,
  Gift,
  UserPlus,
  Clock,
  CheckCircle,
  Award,
} from "lucide-react";
import { toast } from "sonner";
import { useCreditLedger } from "../hooks/use-credit-ledger";
import { useReferralStats } from "../hooks/use-referral-stats";
import {
  buildReferralLink,
  shareOnTwitter,
  shareOnLinkedIn,
  shareOnWhatsApp,
  shareViaEmail,
  sendEmailInvite,
} from "../utils/share-referral";
import { getLedgerIcon, getLedgerBadgeVariant, formatRelativeTime } from "../utils/format-ledger";
import { CreditBalanceCard } from "./credit-balance-card";
import { CreditPricingCard } from "./credit-pricing-card";

export function CreditsSettings() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const ledger = useCreditLedger(page, pageSize);
  const totalPages = Math.max(1, Math.ceil(ledger.total / pageSize));

  return (
    <div className="space-y-6">
      {/* Section A — Credit Balance Card (with gauge + activity) */}
      <CreditBalanceCard />

      {/* Section B — Credit Pricing */}
      <CreditPricingCard />

      {/* Section C — Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>Your credit usage and top-ups</CardDescription>
        </CardHeader>
        <CardContent>
          {ledger.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : ledger.isError ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--wk-status-error)]">
                Failed to load transaction history. Please try again later.
              </p>
            </div>
          ) : ledger.entries.length === 0 ? (
            <div className="py-12 text-center">
              <Coins className="mx-auto h-10 w-10 text-[var(--wk-text-tertiary)]" />
              <p className="mt-3 text-sm font-medium text-[var(--wk-text-primary)]">
                No transactions yet
              </p>
              <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
                Credit transactions will appear here as you use Valet.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Credit transaction history">
                  <thead>
                    <tr className="border-b border-[var(--wk-border-subtle)]">
                      <th
                        scope="col"
                        className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]"
                      >
                        Date
                      </th>
                      <th
                        scope="col"
                        className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]"
                      >
                        Description
                      </th>
                      <th
                        scope="col"
                        className="pb-3 pr-4 text-right font-medium text-[var(--wk-text-secondary)]"
                      >
                        Amount
                      </th>
                      <th
                        scope="col"
                        className="pb-3 text-right font-medium text-[var(--wk-text-secondary)]"
                      >
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--wk-border-subtle)]">
                    {ledger.entries.map((entry) => {
                      const Icon = getLedgerIcon(entry.reason);
                      const badgeVariant = getLedgerBadgeVariant(entry.reason);
                      const isPositive = entry.delta > 0;
                      return (
                        <tr
                          key={entry.id}
                          className={`group transition-colors ${
                            isPositive
                              ? "hover:bg-[color-mix(in_srgb,var(--wk-status-success)_4%,transparent)]"
                              : "hover:bg-[var(--wk-surface-raised)]"
                          }`}
                        >
                          <td className="py-3 pr-4 text-[var(--wk-text-tertiary)]">
                            <span title={new Date(entry.createdAt).toLocaleString()}>
                              {formatRelativeTime(entry.createdAt)}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="flex items-center gap-2">
                              <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--wk-text-tertiary)]" />
                              <span className="text-[var(--wk-text-primary)]">
                                {entry.description ?? entry.reason}
                              </span>
                              <Badge variant={badgeVariant} className="text-[10px] px-1.5 py-0">
                                {entry.reason.replace(/_/g, " ")}
                              </Badge>
                            </span>
                          </td>
                          <td
                            className={`py-3 pr-4 text-right font-medium ${
                              isPositive
                                ? "text-[var(--wk-status-success)]"
                                : "text-[var(--wk-text-secondary)]"
                            }`}
                          >
                            {isPositive ? `+${entry.delta}` : entry.delta}
                          </td>
                          <td className="py-3 text-right text-[var(--wk-text-secondary)]">
                            {entry.balanceAfter}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-[var(--wk-text-secondary)]">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section D — Referrals (feature-flagged) */}
      {import.meta.env.VITE_FEATURE_REFERRALS === "true" && <ReferralSection />}
    </div>
  );
}

function ReferralSection() {
  const { code, totalReferred, pendingCount, activatedCount, rewardedCount, isLoading, isError } =
    useReferralStats();
  const [copied, setCopied] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const referralLink = code ? buildReferralLink(code) : "";
  const creditsEarned = rewardedCount * 200;

  function handleCopyLink() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(
      () => {
        setCopied(true);
        toast.success("Referral link copied!");
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
      },
      () => {
        toast.error("Failed to copy link");
      },
    );
  }

  function handleCopyCode() {
    if (!code) return;
    navigator.clipboard.writeText(code).then(
      () => {
        toast.success("Referral code copied!");
      },
      () => {
        toast.error("Failed to copy code");
      },
    );
  }

  function handleEmailInvite() {
    if (!emailInput.trim() || !referralLink) return;
    sendEmailInvite(emailInput.trim(), referralLink);
    setEmailInput("");
    toast.success("Opening email client...");
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Referrals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Referrals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--wk-status-error)]">
            Failed to load referral data. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Referrals
        </CardTitle>
        <CardDescription>
          Refer friends and earn bonus credits when they complete a task.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Hero banner */}
        <div className="flex items-center gap-4 rounded-[var(--wk-radius-lg)] bg-[color-mix(in_srgb,var(--wk-accent-amber)_8%,transparent)] border border-[color-mix(in_srgb,var(--wk-accent-amber)_20%,transparent)] p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--wk-accent-amber)_16%,transparent)]">
            <Gift className="h-6 w-6 text-[var(--wk-accent-amber)]" />
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--wk-text-primary)]">
              Give 200, get 200
            </p>
            <p className="text-sm text-[var(--wk-text-secondary)]">
              Both you and your friend earn 200 credits when they complete their first application.
            </p>
          </div>
        </div>

        {/* Referral code */}
        <div>
          <p className="mb-2 text-sm font-medium text-[var(--wk-text-primary)]">
            Your referral code
          </p>
          <div className="flex items-center justify-between rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)] px-4 py-3">
            <span className="font-mono text-lg font-bold tracking-widest text-[var(--wk-text-primary)]">
              {code}
            </span>
            <Button variant="ghost" size="sm" onClick={handleCopyCode}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Shareable link */}
        <div>
          <p className="mb-2 text-sm font-medium text-[var(--wk-text-primary)]">Shareable link</p>
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)] px-3 py-2 text-sm text-[var(--wk-text-secondary)]">
              {referralLink}
            </span>
            <Button variant="secondary" size="sm" onClick={handleCopyLink}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Social sharing */}
        <div>
          <p className="mb-2 text-sm font-medium text-[var(--wk-text-primary)]">Share via</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => shareOnTwitter(referralLink)}>
              <Share2 className="mr-1.5 h-4 w-4" />
              Twitter/X
            </Button>
            <Button variant="secondary" size="sm" onClick={() => shareOnLinkedIn(referralLink)}>
              <Share2 className="mr-1.5 h-4 w-4" />
              LinkedIn
            </Button>
            <Button variant="secondary" size="sm" onClick={() => shareOnWhatsApp(referralLink)}>
              <Share2 className="mr-1.5 h-4 w-4" />
              WhatsApp
            </Button>
            <Button variant="secondary" size="sm" onClick={() => shareViaEmail(referralLink)}>
              <Mail className="mr-1.5 h-4 w-4" />
              Email
            </Button>
          </div>
        </div>

        {/* Email invite */}
        <div>
          <p className="mb-2 text-sm font-medium text-[var(--wk-text-primary)]">Invite by email</p>
          <div className="flex items-center gap-2">
            <Input
              type="email"
              placeholder="friend@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEmailInvite()}
            />
            <Button variant="secondary" size="sm" onClick={handleEmailInvite}>
              <Mail className="mr-1.5 h-4 w-4" />
              Send
            </Button>
          </div>
        </div>

        {/* Stats grid with icons */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="flex items-center gap-2 rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)] p-3">
            <UserPlus className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
            <div>
              <p className="text-xl font-bold text-[var(--wk-text-primary)]">{totalReferred}</p>
              <p className="text-xs text-[var(--wk-text-secondary)]">Referred</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)] p-3">
            <Clock className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
            <div>
              <p className="text-xl font-bold text-[var(--wk-text-primary)]">{pendingCount}</p>
              <p className="text-xs text-[var(--wk-text-secondary)]">Pending</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)] p-3">
            <CheckCircle className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
            <div>
              <p className="text-xl font-bold text-[var(--wk-text-primary)]">{activatedCount}</p>
              <p className="text-xs text-[var(--wk-text-secondary)]">Activated</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)] p-3">
            <Award className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
            <div>
              <p className="text-xl font-bold text-[var(--wk-text-primary)]">{rewardedCount}</p>
              <p className="text-xs text-[var(--wk-text-secondary)]">Rewarded</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] bg-[color-mix(in_srgb,var(--wk-status-success)_6%,transparent)] p-3">
            <Coins className="h-4 w-4 text-[var(--wk-status-success)]" />
            <div>
              <p className="text-xl font-bold text-[var(--wk-status-success)]">{creditsEarned}</p>
              <p className="text-xs text-[var(--wk-text-secondary)]">Credits earned</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
