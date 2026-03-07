import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Progress } from "@valet/ui/components/progress";
import { Skeleton } from "@valet/ui/components/skeleton";
import { Coins, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useCreditBalance } from "@/features/apply/hooks/use-credit-balance";
import { useCreditLedger } from "../hooks/use-credit-ledger";
import { getLedgerIcon } from "../utils/format-ledger";

interface ActivitySummary {
  reason: string;
  label: string;
  count: number;
  total: number;
}

const reasonLabels: Record<string, string> = {
  task_application: "Applications",
  batch_application: "Batch applications",
  premium_analysis: "Analysis",
  resume_optimization: "Resume optimization",
  cover_letter: "Cover letters",
  referral_reward: "Referral rewards",
  admin_grant: "Grants",
  signup_bonus: "Signup bonus",
  refund: "Refunds",
};

export function CreditBalanceCard() {
  const {
    balance,
    trialExpiry,
    enforcementEnabled,
    isLoading: balanceLoading,
  } = useCreditBalance();
  const ledger = useCreditLedger(1, 50);

  const activitySummary = useMemo<ActivitySummary[]>(() => {
    if (!ledger.entries.length) return [];
    const grouped = new Map<string, { count: number; total: number }>();
    for (const entry of ledger.entries) {
      const existing = grouped.get(entry.reason);
      if (existing) {
        existing.count += 1;
        existing.total += Math.abs(entry.delta);
      } else {
        grouped.set(entry.reason, { count: 1, total: Math.abs(entry.delta) });
      }
    }
    return Array.from(grouped.entries())
      .map(([reason, { count, total }]) => ({
        reason,
        label: reasonLabels[reason] ?? reason,
        count,
        total,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [ledger.entries]);

  const maxCount = useMemo(
    () => Math.max(...activitySummary.map((s) => s.count), 1),
    [activitySummary],
  );

  if (balanceLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Credit Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const lowBalance = balance < 10;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5" />
          Credit Balance
        </CardTitle>
        <CardDescription>Your current balance and recent activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          {/* Left: Circular gauge */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-[120px] w-[120px]">
              {/* Background ring */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(
                    var(--wk-accent-amber) ${Math.min((balance / Math.max(balance, 100)) * 100, 100) * 3.6}deg,
                    var(--wk-border-subtle) 0deg
                  )`,
                  mask: "radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 8px))",
                  WebkitMask:
                    "radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 8px))",
                }}
              />
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-[var(--wk-text-primary)]">{balance}</span>
                <span className="text-xs text-[var(--wk-text-tertiary)]">credits</span>
              </div>
            </div>
          </div>

          {/* Right: Activity summary */}
          <div className="flex-1 space-y-3">
            <p className="text-sm font-medium text-[var(--wk-text-secondary)]">Recent activity</p>
            {activitySummary.length === 0 ? (
              <p className="text-sm text-[var(--wk-text-tertiary)]">No recent activity</p>
            ) : (
              <div className="space-y-2.5">
                {activitySummary.map((item) => {
                  const Icon = getLedgerIcon(item.reason);
                  return (
                    <div key={item.reason} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-[var(--wk-text-primary)]">
                          <Icon className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />
                          {item.label}
                        </span>
                        <span className="text-[var(--wk-text-secondary)]">{item.count}</span>
                      </div>
                      <Progress value={(item.count / maxCount) * 100} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom: Warnings and badges */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {lowBalance && (
            <div className="flex items-center gap-1.5 rounded-[var(--wk-radius-lg)] bg-[color-mix(in_srgb,var(--wk-status-warning)_8%,transparent)] border border-[color-mix(in_srgb,var(--wk-status-warning)_20%,transparent)] px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-[var(--wk-status-warning)]" />
              <span className="text-xs text-[var(--wk-status-warning)]">
                Low balance — consider adding more credits
              </span>
            </div>
          )}
          {trialExpiry && (
            <span className="text-xs text-[var(--wk-text-secondary)]">
              Trial expires {format(new Date(trialExpiry), "MMM d, yyyy")}
            </span>
          )}
          {enforcementEnabled && <Badge variant="default">Enforcement active</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}
