import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "#0A66C2",
  greenhouse: "#059669",
  lever: "#0D9488",
  workday: "#EA580C",
  unknown: "#6B7280",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ConversionChart() {
  const { data, isLoading, isError } = api.insights.getConversionByPlatform.useQuery({
    queryKey: ["insights", "conversion"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const platforms = data?.status === 200 ? data.body.platforms : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Platform Conversion</CardTitle>
        <p className="text-xs text-[var(--wk-text-tertiary)]">Completion rate by job platform</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <div className="py-12 text-center text-sm text-[var(--wk-status-error)]">
            Failed to load conversion data.
          </div>
        ) : platforms.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--wk-text-tertiary)]">
            No application data yet.
          </div>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platforms} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--wk-border-subtle)"
                  vertical={false}
                />
                <XAxis
                  dataKey="platform"
                  tickFormatter={capitalize}
                  tick={{ fontSize: 11, fill: "var(--wk-text-tertiary)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: "var(--wk-text-tertiary)" }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--wk-surface-card)",
                    border: "1px solid var(--wk-border-subtle)",
                    borderRadius: "var(--wk-radius-lg)",
                    fontSize: 12,
                  }}
                  labelFormatter={(label) => capitalize(String(label))}
                  formatter={(value, name) => {
                    if (name === "conversionRate") return [`${value}%`, "Conversion"];
                    return [value, capitalize(String(name))];
                  }}
                />
                <Bar dataKey="conversionRate" radius={[4, 4, 0, 0]} name="conversionRate">
                  {platforms.map((entry) => (
                    <Cell
                      key={entry.platform}
                      fill={PLATFORM_COLORS[entry.platform] ?? PLATFORM_COLORS.unknown}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
