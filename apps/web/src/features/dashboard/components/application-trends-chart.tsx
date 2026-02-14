import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@valet/ui/components/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
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

export function ApplicationTrendsChart() {
  const { data, isLoading, isError } = api.dashboard.trends.useQuery({
    queryKey: ["dashboard", "trends"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const trends = data?.status === 200 ? data.body.trends : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Application Trends</CardTitle>
        <p className="text-xs text-[var(--wk-text-tertiary)]">
          Daily applications over the last 30 days
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <div className="py-12 text-center text-sm text-[var(--wk-status-error)]">
            Failed to load trends data.
          </div>
        ) : trends.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--wk-text-tertiary)]">
            No application data yet.
          </div>
        ) : (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={trends}
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
                  formatter={(value) => [value, "Applications"]}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--wk-copilot)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
