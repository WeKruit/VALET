import { Coins, AlertTriangle, Check } from "lucide-react";
import { Skeleton } from "@valet/ui/components/skeleton";
import { useCreditCost } from "../hooks/use-credit-cost";
import type { CreditCostType } from "@valet/shared/schemas";

interface CreditCostIndicatorProps {
  costType: CreditCostType;
  quantity?: number;
  showBalance?: boolean;
}

export function CreditCostIndicator({
  costType,
  quantity = 1,
  showBalance = false,
}: CreditCostIndicatorProps) {
  const { totalCost, balance, canAfford, isLoading } = useCreditCost(costType, quantity);

  if (isLoading) {
    return <Skeleton className="inline-block h-5 w-24" />;
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1 text-[var(--wk-text-secondary)]">
        <Coins className="h-3.5 w-3.5" />
        <span>
          <span className="font-medium text-[var(--wk-text-primary)]">
            {totalCost} credit{totalCost !== 1 ? "s" : ""}
          </span>
        </span>
      </span>
      {showBalance && <span className="text-[var(--wk-text-tertiary)]">Balance: {balance}</span>}
      {canAfford ? (
        <Check className="h-3.5 w-3.5 text-[var(--wk-status-success)]" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-[var(--wk-status-error)]" />
      )}
    </span>
  );
}
