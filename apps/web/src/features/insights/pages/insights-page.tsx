import { useState } from "react";
import { VelocityChart } from "../components/velocity-chart";
import { ConversionChart } from "../components/conversion-chart";
import { ResponseRatesChart } from "../components/response-rates-chart";
import { ResumePerformanceTable } from "../components/resume-performance-table";

const PERIOD_OPTIONS = [
  { value: "7d" as const, label: "7 days" },
  { value: "30d" as const, label: "30 days" },
  { value: "90d" as const, label: "90 days" },
];

// Feature flag for future Metabase embedded mode (Path C hybrid approach).
// When enabled, renders an iframe container instead of native charts.
// See docs/repo-fit-assessment.md for the Metabase integration decision gate.
const METABASE_ENABLED = false;

export function InsightsPage() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  if (METABASE_ENABLED) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold text-[var(--wk-text-primary)]">
            Insights
          </h1>
          <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
            Embedded analytics dashboard
          </p>
        </div>
        <div className="rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] overflow-hidden">
          {/* Metabase iframe placeholder — replace src with actual Metabase embed URL */}
          <iframe
            src=""
            title="Metabase Dashboard"
            className="w-full h-[800px] border-0"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold text-[var(--wk-text-primary)]">
            Insights
          </h1>
          <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
            Track your application performance and trends
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-[var(--wk-radius-md)] transition-colors cursor-pointer ${
                period === opt.value
                  ? "bg-[var(--wk-surface-raised)] text-[var(--wk-text-primary)]"
                  : "text-[var(--wk-text-tertiary)] hover:text-[var(--wk-text-secondary)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <VelocityChart period={period} />

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        <ConversionChart />
        <ResponseRatesChart />
      </div>

      <ResumePerformanceTable />
    </div>
  );
}
