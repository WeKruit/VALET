import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { CircleDot, Gauge, Lock } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";

export function PreferencesSettings() {
  const user = useAuth((s) => s.user);
  const autopilotUnlocked = user?.autopilotUnlocked ?? false;
  const copilotAppsCompleted = user?.copilotAppsCompleted ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automation Mode</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Copilot */}
          <div className="rounded-[var(--wk-radius-lg)] border-2 border-[var(--wk-copilot)] bg-blue-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CircleDot className="h-5 w-5 text-[var(--wk-copilot)]" />
              <span className="font-semibold">Copilot</span>
              <Badge variant="copilot">Active</Badge>
            </div>
            <p className="text-sm text-[var(--wk-text-secondary)]">
              AI fills, you review and submit.
            </p>
          </div>

          {/* Autopilot */}
          <div
            className={`rounded-[var(--wk-radius-lg)] border p-4 space-y-3 ${
              autopilotUnlocked
                ? "border-[var(--wk-autopilot)]"
                : "border-[var(--wk-border-default)] opacity-60"
            }`}
          >
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-[var(--wk-autopilot)]" />
              <span className="font-semibold">Autopilot</span>
              {autopilotUnlocked ? (
                <Badge variant="autopilot">Available</Badge>
              ) : (
                <Badge variant="default">
                  <Lock className="mr-1 h-3 w-3" />
                  Locked
                </Badge>
              )}
            </div>
            <p className="text-sm text-[var(--wk-text-secondary)]">
              {autopilotUnlocked
                ? "AI fills AND submits automatically."
                : `Complete ${3 - copilotAppsCompleted} more Copilot application${3 - copilotAppsCompleted === 1 ? "" : "s"} to unlock.`}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
