import { Card, CardContent } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Gauge, CircleDot } from "lucide-react";

interface ModeSelectionProps {
  onSelect: (mode: "copilot" | "autopilot") => void;
}

export function ModeSelection({ onSelect }: ModeSelectionProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-display text-2xl font-semibold">
          Autopilot Mode Unlocked!
        </h2>
        <p className="text-sm text-[var(--wk-text-secondary)]">
          You've completed 3 applications with high confidence and zero critical
          errors. You've earned Autopilot mode.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Copilot */}
        <Card className="cursor-pointer hover:ring-2 hover:ring-[var(--wk-copilot)]">
          <CardContent className="p-6 space-y-4 text-center">
            <div className="flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[var(--wk-copilot)]">
                <CircleDot className="h-6 w-6" />
              </div>
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold">Copilot</h3>
              <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
                You review every app before it goes out.
              </p>
            </div>
            <ul className="text-xs text-[var(--wk-text-secondary)] space-y-1 text-left">
              <li>Best for important roles</li>
              <li>Best for new job types</li>
              <li>Maximum control</li>
            </ul>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => onSelect("copilot")}
            >
              Keep Using Copilot
            </Button>
          </CardContent>
        </Card>

        {/* Autopilot */}
        <Card className="cursor-pointer hover:ring-2 hover:ring-[var(--wk-autopilot)]">
          <CardContent className="p-6 space-y-4 text-center">
            <div className="flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-[var(--wk-autopilot)]">
                <Gauge className="h-6 w-6" />
              </div>
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold">Autopilot</h3>
              <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
                AI submits, you review the summary after.
              </p>
            </div>
            <ul className="text-xs text-[var(--wk-text-secondary)] space-y-1 text-left">
              <li>Best for volume applying</li>
              <li>Best for familiar job boards</li>
              <li>Maximum speed</li>
            </ul>
            <Button
              variant="primary"
              className="w-full bg-[var(--wk-autopilot)] hover:opacity-90"
              onClick={() => onSelect("autopilot")}
            >
              Try Autopilot
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-xs text-[var(--wk-text-tertiary)]">
        You can switch between modes anytime, even per-application.
      </p>
    </div>
  );
}
