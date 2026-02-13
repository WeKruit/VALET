import { Card, CardContent } from "@valet/ui/components/card";
import {
  BarChart3,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function StatsCards() {
  const { data, isLoading, isError, refetch } = api.dashboard.stats.useQuery({
    queryKey: ["dashboard", "stats"],
    queryData: {},
    staleTime: 1000 * 30,
  });

  const body = data?.status === 200 ? data.body : null;

  const stats = [
    {
      label: "Total Applications",
      value: body?.total ?? 0,
      icon: BarChart3,
      iconColor: "text-[var(--wk-text-primary)]",
      iconBg: "bg-[var(--wk-surface-sunken)]",
      subtitle: "all time",
    },
    {
      label: "Completed",
      value: body?.completed ?? 0,
      icon: CheckCircle,
      iconColor: "text-[var(--wk-status-success)]",
      iconBg: "bg-emerald-50 dark:bg-emerald-950/30",
      subtitle: "all time",
    },
    {
      label: "In Progress",
      value: body?.inProgress ?? 0,
      icon: Clock,
      iconColor: "text-[var(--wk-status-info)]",
      iconBg: "bg-blue-50 dark:bg-blue-950/30",
      subtitle: "active now",
    },
    {
      label: "Needs Review",
      value: body?.needsReview ?? 0,
      icon: AlertCircle,
      iconColor: "text-[var(--wk-status-warning)]",
      iconBg: "bg-amber-50 dark:bg-amber-950/30",
      subtitle: "pending",
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="cursor-default">
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
              <p className="mt-2 font-display text-3xl font-semibold text-[var(--wk-text-tertiary)]">
                --
              </p>
              <button
                onClick={() => refetch()}
                className="mt-2 text-xs font-medium text-[var(--wk-accent-amber)] hover:underline cursor-pointer"
              >
                Refresh
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
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
            <p className="mt-2 text-xs text-[var(--wk-text-tertiary)]">
              {stat.subtitle}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
