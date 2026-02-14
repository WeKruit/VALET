import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Switch } from "@valet/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@valet/ui/components/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@valet/ui/components/dialog";
import { Button } from "@valet/ui/components/button";
import { CircleDot, Gauge, Lock } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

export function PreferencesSettings() {
  const user = useAuth((s) => s.user);
  const autopilotUnlocked = user?.autopilotUnlocked ?? false;
  const copilotAppsCompleted = user?.copilotAppsCompleted ?? 0;

  const { data: prefsData } = api.users.getPreferences.useQuery({
    queryKey: ["users", "preferences"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const prefs = prefsData?.status === 200 ? prefsData.body : null;
  const isAutopilot = prefs?.submissionMode === "auto_submit";

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const updatePreferences = api.users.updatePreferences.useMutation({
    onSuccess: () => {
      toast.success("Automation mode updated.");
    },
    onError: () => {
      toast.error("Failed to update automation mode.");
    },
  });

  function handleModeToggle(checked: boolean) {
    if (checked) {
      // Switching to autopilot -- show confirmation
      setConfirmDialogOpen(true);
    } else {
      // Switching back to copilot -- no confirmation needed
      updatePreferences.mutate({
        body: { submissionMode: "review_before_submit" },
      });
    }
  }

  function confirmAutopilot() {
    setConfirmDialogOpen(false);
    updatePreferences.mutate({
      body: { submissionMode: "auto_submit" },
    });
  }

  const remainingApps = Math.max(0, 3 - copilotAppsCompleted);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Automation Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Copilot */}
            <div
              className={`rounded-[var(--wk-radius-lg)] border-2 p-4 space-y-3 transition-colors ${
                !isAutopilot
                  ? "border-[var(--wk-copilot)] bg-blue-50 dark:bg-blue-950/20"
                  : "border-[var(--wk-border-default)]"
              }`}
            >
              <div className="flex items-center gap-2">
                <CircleDot className="h-5 w-5 text-[var(--wk-copilot)]" />
                <span className="font-semibold">Copilot</span>
                {!isAutopilot && <Badge variant="copilot">Active</Badge>}
              </div>
              <p className="text-sm text-[var(--wk-text-secondary)]">
                AI fills, you review and submit.
              </p>
            </div>

            {/* Autopilot */}
            <div
              className={`rounded-[var(--wk-radius-lg)] border-2 p-4 space-y-3 transition-colors ${
                isAutopilot
                  ? "border-[var(--wk-autopilot)] bg-violet-50 dark:bg-violet-950/20"
                  : autopilotUnlocked
                    ? "border-[var(--wk-border-default)]"
                    : "border-[var(--wk-border-default)] opacity-60"
              }`}
            >
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-[var(--wk-autopilot)]" />
                <span className="font-semibold">Autopilot</span>
                {isAutopilot ? (
                  <Badge variant="autopilot">Active</Badge>
                ) : autopilotUnlocked ? (
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
                  : `Complete ${remainingApps} more Copilot application${remainingApps === 1 ? "" : "s"} to unlock.`}
              </p>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center justify-between rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-default)] p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {isAutopilot ? "Autopilot mode enabled" : "Switch to Autopilot"}
              </p>
              <p className="text-xs text-[var(--wk-text-secondary)]">
                {isAutopilot
                  ? "Applications are submitted automatically when confidence is high enough."
                  : "Toggle to let VALET submit applications without manual review."}
              </p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Switch
                      checked={isAutopilot}
                      onCheckedChange={handleModeToggle}
                      disabled={!autopilotUnlocked || updatePreferences.isPending}
                      aria-label="Toggle Autopilot mode"
                    />
                  </span>
                </TooltipTrigger>
                {!autopilotUnlocked && (
                  <TooltipContent>
                    <p>Complete {remainingApps} more Copilot application{remainingApps === 1 ? "" : "s"} to unlock Autopilot.</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation dialog for enabling Autopilot */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable Autopilot Mode?</DialogTitle>
            <DialogDescription>
              In Autopilot mode, VALET will automatically submit applications
              when the confidence score meets your threshold. You will still
              receive notifications for each submission.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-[var(--wk-radius-md)] bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              You can switch back to Copilot mode at any time from this settings page.
            </p>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirmAutopilot}>
              Enable Autopilot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
