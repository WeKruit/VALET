import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";

export function ResumePerformanceTable() {
  const { data, isLoading, isError } = api.insights.getResumePerformance.useQuery({
    queryKey: ["insights", "resume-performance"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const resumes = data?.status === 200 ? data.body.resumes : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Resume Variant Performance</CardTitle>
        <p className="text-xs text-[var(--wk-text-tertiary)]">
          Match score improvements across tailored variants
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <div className="py-12 text-center text-sm text-[var(--wk-status-error)]">
            Failed to load resume performance data.
          </div>
        ) : resumes.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--wk-text-tertiary)]">
            No resume variants yet. Use the Fit Lab to create tailored resumes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--wk-border-subtle)]">
                  <th className="text-left py-2 px-3 font-medium text-[var(--wk-text-secondary)]">
                    Resume
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-[var(--wk-text-secondary)]">
                    Variants
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-[var(--wk-text-secondary)]">
                    Avg Before
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-[var(--wk-text-secondary)]">
                    Avg After
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-[var(--wk-text-secondary)]">
                    Improvement
                  </th>
                </tr>
              </thead>
              <tbody>
                {resumes.map((r) => (
                  <tr
                    key={r.resumeId}
                    className="border-b border-[var(--wk-border-subtle)] last:border-0"
                  >
                    <td className="py-2.5 px-3 text-[var(--wk-text-primary)] truncate max-w-[200px]">
                      {r.resumeFilename}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[var(--wk-text-secondary)]">
                      {r.variantCount}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[var(--wk-text-secondary)]">
                      {r.avgMatchScoreBefore != null ? `${r.avgMatchScoreBefore}%` : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[var(--wk-text-secondary)]">
                      {r.avgMatchScoreAfter != null ? `${r.avgMatchScoreAfter}%` : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {r.avgImprovement != null ? (
                        <span
                          className={
                            r.avgImprovement > 0
                              ? "text-[var(--wk-status-success)]"
                              : r.avgImprovement < 0
                                ? "text-[var(--wk-status-error)]"
                                : "text-[var(--wk-text-tertiary)]"
                          }
                        >
                          {r.avgImprovement > 0 ? "+" : ""}
                          {Math.round(r.avgImprovement)}%
                        </span>
                      ) : (
                        <span className="text-[var(--wk-text-tertiary)]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
