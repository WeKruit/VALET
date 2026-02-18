interface CostBreakdown {
  cookbookCostUsd: number;
  magnitudeCostUsd: number;
  imageCostUsd: number;
  reasoningCostUsd: number;
  cookbookSteps: number;
  magnitudeSteps: number;
}

export function calculateSavings(
  breakdown: CostBreakdown,
  actionCount: number,
): { savings: number; savingsPercent: number } {
  const estimatedFullAiCost = actionCount * 0.0025;
  const totalCost =
    breakdown.cookbookCostUsd +
    breakdown.magnitudeCostUsd +
    breakdown.imageCostUsd +
    breakdown.reasoningCostUsd;
  const savings = estimatedFullAiCost - totalCost;
  const savingsPercent =
    estimatedFullAiCost > 0 ? Math.round((1 - totalCost / estimatedFullAiCost) * 100) : 0;
  return { savings: Math.max(0, savings), savingsPercent: Math.max(0, savingsPercent) };
}
