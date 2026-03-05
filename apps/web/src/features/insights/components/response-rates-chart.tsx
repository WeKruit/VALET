import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";

const STATUS_COLORS: Record<string, string> = {
  applied: "#3B82F6",
  viewed: "#8B5CF6",
  interview: "#059669",
  rejected: "#EF4444",
  offer: "#F59E0B",
  ghosted: "#6B7280",
  unknown: "#9CA3AF",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ResponseRatesChart() {
  const { data, isLoading, isError } = api.insights.getResponseRates.useQuery({
    queryKey: ["insights", "response-rates"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const result = data?.status === 200 ? data.body : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Response Rates</CardTitle>
        <p className="text-xs text-[var(--wk-text-tertiary)]">
          {result
            ? `${result.totalWithStatus} tracked / ${result.totalWithoutStatus} pending`
            : "Status distribution across applications"}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError || !result ? (
          <div className="py-12 text-center text-sm text-[var(--wk-status-error)]">
            Failed to load response data.
          </div>
        ) : result.rates.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--wk-text-tertiary)]">
            No response data yet.
          </div>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={result.rates}
                  dataKey="count"
                  nameKey="externalStatus"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={50}
                  paddingAngle={2}
                  label={({ name, percent }) =>
                    `${capitalize(String(name))} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={{ strokeWidth: 1 }}
                >
                  {result.rates.map((entry) => (
                    <Cell
                      key={entry.externalStatus}
                      fill={STATUS_COLORS[entry.externalStatus] ?? STATUS_COLORS.unknown}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--wk-surface-card)",
                    border: "1px solid var(--wk-border-subtle)",
                    borderRadius: "var(--wk-radius-lg)",
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [value, capitalize(String(name))]}
                />
                <Legend formatter={(value) => capitalize(value)} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
