import { Card, CardContent } from "@valet/ui/components/card";
import {
  BarChart3,
  CheckCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { useTasks } from "@/features/tasks/hooks/use-tasks";
import { LoadingSpinner } from "@/components/common/loading-spinner";

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

type TrendDirection = "up" | "down" | "flat";

const trendIcon: Record<TrendDirection, React.ElementType> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

const trendColor: Record<TrendDirection, string> = {
  up: "text-[var(--wk-status-success)]",
  down: "text-[var(--wk-status-error)]",
  flat: "text-[var(--wk-text-tertiary)]",
};

export function StatsCards() {
  const { data, isLoading, isError } = useTasks({ page: 1 });
  const { data: completedData } = useTasks({ status: "completed" });
  const { data: inProgressData } = useTasks({ status: "in_progress" });
  const { data: reviewData } = useTasks({ status: "waiting_human" });

  const total = data?.status === 200 ? data.body.pagination.total : 0;
  const completed =
    completedData?.status === 200 ? completedData.body.pagination.total : 0;
  const inProgress =
    inProgressData?.status === 200 ? inProgressData.body.pagination.total : 0;
  const needsReview =
    reviewData?.status === 200 ? reviewData.body.pagination.total : 0;

  const stats = [
    {
      label: "Total Applications",
      value: total,
      icon: BarChart3,
      iconColor: "text-[var(--wk-text-primary)]",
      iconBg: "bg-[var(--wk-surface-sunken)]",
      trend: "up" as TrendDirection,
      trendLabel: "all time",
    },
    {
      label: "Completed",
      value: completed,
      icon: CheckCircle,
      iconColor: "text-[var(--wk-status-success)]",
      iconBg: "bg-emerald-50 dark:bg-emerald-950/30",
      trend: "up" as TrendDirection,
      trendLabel: "success rate",
    },
    {
      label: "In Progress",
      value: inProgress,
      icon: Clock,
      iconColor: "text-[var(--wk-status-info)]",
      iconBg: "bg-blue-50 dark:bg-blue-950/30",
      trend: (inProgress > 0 ? "up" : "flat") as TrendDirection,
      trendLabel: "active now",
    },
    {
      label: "Needs Review",
      value: needsReview,
      icon: AlertCircle,
      iconColor: "text-[var(--wk-status-warning)]",
      iconBg: "bg-amber-50 dark:bg-amber-950/30",
      trend: (needsReview > 0 ? "up" : "flat") as TrendDirection,
      trendLabel: "pending",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex justify-center p-5">
              <LoadingSpinner />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-5 text-center text-sm text-[var(--wk-status-error)]">
          Failed to load statistics. Please try refreshing the page.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const TrendIcon = trendIcon[stat.trend];

        return (
          <Card
            key={stat.label}
            className="cursor-default"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                  {stat.label}
                </p>
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-[var(--wk-radius-lg)] ${stat.iconBg} ${stat.iconColor}`}
                >
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-2 font-display text-3xl font-semibold">
                {formatNumber(stat.value)}
              </p>
              <div className="mt-2 flex items-center gap-1">
                <TrendIcon
                  className={`h-3.5 w-3.5 ${trendColor[stat.trend]}`}
                />
                <span className="text-xs text-[var(--wk-text-tertiary)]">
                  {stat.trendLabel}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
