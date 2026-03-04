import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";

interface MatchScoreProps {
  score: number;
  beforeScore?: number | null;
  afterScore?: number | null;
  strengthSummary: string;
  improvementSummary: string;
  matchedCount: number;
  missingCount: number;
  compact?: boolean;
}

function ScoreRing({ score, label, size = 80 }: { score: number; label: string; size?: number }) {
  const pct = Math.round(score * 100);
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - score * circumference;

  const color =
    pct >= 80
      ? "var(--wk-status-success)"
      : pct >= 50
        ? "var(--wk-accent-amber)"
        : "var(--wk-status-error)";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--wk-surface-sunken)"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span className="text-lg font-bold text-[var(--wk-text-primary)]">{pct}%</span>
      </div>
      <span className="text-[10px] font-medium text-[var(--wk-text-tertiary)]">{label}</span>
    </div>
  );
}

export function MatchScore({
  score,
  beforeScore,
  afterScore,
  strengthSummary,
  improvementSummary,
  matchedCount,
  missingCount,
  compact = false,
}: MatchScoreProps) {
  const showBeforeAfter = beforeScore != null && afterScore != null && beforeScore !== afterScore;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={compact ? "text-xs" : "text-sm"}>Match Score</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score rings */}
        <div className="flex items-center justify-center gap-6">
          {showBeforeAfter ? (
            <>
              <div className="relative">
                <ScoreRing
                  score={(beforeScore ?? 0) / 100}
                  label="Before"
                  size={compact ? 64 : 80}
                />
              </div>
              <div className="text-[var(--wk-text-tertiary)]">→</div>
              <div className="relative">
                <ScoreRing score={(afterScore ?? 0) / 100} label="After" size={compact ? 64 : 80} />
              </div>
            </>
          ) : (
            <div className="relative">
              <ScoreRing score={score} label="Match" size={compact ? 72 : 96} />
            </div>
          )}
        </div>

        {/* Matched / Missing counts */}
        <div className="flex justify-center gap-6">
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--wk-status-success)]">{matchedCount}</p>
            <p className="text-[10px] text-[var(--wk-text-tertiary)]">Matched</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--wk-status-error)]">{missingCount}</p>
            <p className="text-[10px] text-[var(--wk-text-tertiary)]">Missing</p>
          </div>
        </div>

        {/* Summaries */}
        <div className="space-y-2">
          <div className="rounded-[var(--wk-radius-md)] bg-emerald-50/50 dark:bg-emerald-950/10 p-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-status-success)] mb-1">
              Strengths
            </p>
            <p className="text-xs text-[var(--wk-text-secondary)]">{strengthSummary}</p>
          </div>
          <div className="rounded-[var(--wk-radius-md)] bg-amber-50/50 dark:bg-amber-950/10 p-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-accent-amber)] mb-1">
              Areas to Improve
            </p>
            <p className="text-xs text-[var(--wk-text-secondary)]">{improvementSummary}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
