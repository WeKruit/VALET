import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Switch } from "@valet/ui/components/switch";
import { Button } from "@valet/ui/components/button";
import { Bell, CheckCircle2, XCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useQueryClient } from "@tanstack/react-query";

export function NotificationSettings() {
  const queryClient = useQueryClient();

  const { data, isLoading } = api.users.getNotificationPreferences.useQuery({
    queryKey: ["users", "notificationPreferences"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const updatePrefs = api.users.updateNotificationPreferences.useMutation({
    onSuccess: (res) => {
      if (res.status === 200) {
        toast.success("Notification preferences saved.");
        queryClient.invalidateQueries({ queryKey: ["users", "notificationPreferences"] });
      }
    },
    onError: () => {
      toast.error("Failed to save. Please try again.");
    },
  });

  const prefs = data?.status === 200 ? data.body : null;

  const [taskCompleted, setTaskCompleted] = useState(true);
  const [taskFailed, setTaskFailed] = useState(true);
  const [resumeParsed, setResumeParsed] = useState(true);

  useEffect(() => {
    if (prefs) {
      setTaskCompleted(prefs.taskCompleted ?? true);
      setTaskFailed(prefs.taskFailed ?? true);
      setResumeParsed(prefs.resumeParsed ?? true);
    }
  }, [prefs]);

  function handleSave() {
    updatePrefs.mutate({
      body: { taskCompleted, taskFailed, resumeParsed },
    });
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--wk-text-secondary)]">
            Choose which notifications you want to receive.
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[var(--wk-radius-lg)] bg-green-50">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Task Completed</p>
                  <p className="text-xs text-[var(--wk-text-secondary)]">
                    When an application task completes successfully
                  </p>
                </div>
              </div>
              <Switch
                checked={taskCompleted}
                onCheckedChange={setTaskCompleted}
              />
            </div>

            <div className="flex items-center justify-between rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[var(--wk-radius-lg)] bg-red-50">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Task Failed</p>
                  <p className="text-xs text-[var(--wk-text-secondary)]">
                    When an application task fails or needs attention
                  </p>
                </div>
              </div>
              <Switch
                checked={taskFailed}
                onCheckedChange={setTaskFailed}
              />
            </div>

            <div className="flex items-center justify-between rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[var(--wk-radius-lg)] bg-blue-50">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Resume Parsed</p>
                  <p className="text-xs text-[var(--wk-text-secondary)]">
                    When a resume has been parsed and is ready for use
                  </p>
                </div>
              </div>
              <Switch
                checked={resumeParsed}
                onCheckedChange={setResumeParsed}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="primary"
              disabled={updatePrefs.isPending}
              onClick={handleSave}
            >
              {updatePrefs.isPending ? "Saving..." : "Save Preferences"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
