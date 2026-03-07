import { useMemo } from "react";
import { useCreditBalance } from "@/features/apply/hooks/use-credit-balance";
import { useCostConfig } from "./use-cost-config";
import type { CreditCostType } from "@valet/shared/schemas";

export function useCreditCost(costType: CreditCostType, quantity = 1) {
  const { balance, isLoading: balanceLoading } = useCreditBalance();
  const { costs, isLoading: configLoading } = useCostConfig();

  const costEntry = useMemo(() => costs.find((c) => c.costType === costType), [costs, costType]);

  const unitCost = costEntry?.credits ?? 0;
  const totalCost = unitCost * quantity;
  const canAfford = balance >= totalCost;
  const remaining = balance - totalCost;
  const label = costEntry?.label ?? costType;

  return {
    unitCost,
    totalCost,
    balance,
    canAfford,
    remaining,
    label,
    isLoading: balanceLoading || configLoading,
  };
}
