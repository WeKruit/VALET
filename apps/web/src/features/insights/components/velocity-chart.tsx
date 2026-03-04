import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function VelocityChart({ period }: { period: "7d" | "30d" | "90d" }) {
  const { data, isLoading, isError } = api.insights.getVelocity.useQuery({
    queryKey: ["insights", "velocity", period],
    queryData: { query: { period } },
    staleTime: 1000 * 60 * 5,
  });

  const result = data?.status === 200 ? data.body : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Application Velocity</CardTitle>
        <p className="text-xs text-[var(--wk-text-tertiary)]">
          {result
            ? `${result.totalTasks} total / ${result.avgPerDay} avg per day`
            : `Daily applications over the last ${period.replace("d", " days")}`}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError || !result ? (
          <div className="py-12 text-center text-sm text-[var(--wk-status-error)]">
            Failed to load velocity data.
          </div>
        ) : result.dataPoints.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--wk-text-tertiary)]">
            No application data yet.
          </div>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={result.dataPoints}
                margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--wk-border-subtle)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateLabel}
                  tick={{ fontSize: 11, fill: "var(--wk-text-tertiary)" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--wk-text-tertiary)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--wk-surface-card)",
                    border: "1px solid var(--wk-border-subtle)",
                    borderRadius: "var(--wk-radius-lg)",
                    fontSize: 12,
                  }}
                  labelFormatter={(label) => formatDateLabel(String(label))}
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  stackId="1"
                  stroke="var(--wk-status-success)"
                  fill="var(--wk-status-success)"
                  fillOpacity={0.3}
                  strokeWidth={2}
                  name="Completed"
                />
                <Area
                  type="monotone"
                  dataKey="failed"
                  stackId="1"
                  stroke="var(--wk-status-error)"
                  fill="var(--wk-status-error)"
                  fillOpacity={0.3}
                  strokeWidth={2}
                  name="Failed"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
