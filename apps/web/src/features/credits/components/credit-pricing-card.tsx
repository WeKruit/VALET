import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Skeleton } from "@valet/ui/components/skeleton";
import { Briefcase, Layers, Search, FileText, PenTool } from "lucide-react";
import { useCostConfig } from "../hooks/use-cost-config";
import type { LucideIcon } from "lucide-react";

const costTypeIcons: Record<string, LucideIcon> = {
  task_application: Briefcase,
  batch_application: Layers,
  premium_analysis: Search,
  resume_optimization: FileText,
  cover_letter: PenTool,
};

export function CreditPricingCard() {
  const { costs, isLoading, isError } = useCostConfig();

  if (isError) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit Pricing</CardTitle>
        <CardDescription>How credits are used across features</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {costs.map((cost) => {
              const Icon = costTypeIcons[cost.costType] ?? Briefcase;
              return (
                <div
                  key={cost.costType}
                  className="flex items-center gap-3 rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)] p-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--wk-accent-amber)_12%,transparent)]">
                    <Icon className="h-4 w-4 text-[var(--wk-accent-amber)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--wk-text-primary)]">
                      {cost.label}
                    </p>
                    <p className="text-xs text-[var(--wk-text-tertiary)] truncate">
                      {cost.description}
                    </p>
                  </div>
                  <Badge className="shrink-0 bg-[color-mix(in_srgb,var(--wk-accent-amber)_12%,transparent)] text-[var(--wk-accent-amber)] border-none">
                    {cost.credits} cr
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
