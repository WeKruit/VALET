import { api } from "@/lib/api-client";

/**
 * WEK-134: Fetch the VNC live-view URL for a task's sandbox.
 * Only fetches when `enabled` is true (task is active, not terminal).
 */
export function useVncUrl(taskId: string, enabled: boolean) {
  return api.tasks.getVncUrl.useQuery({
    queryKey: ["tasks", taskId, "vnc-url"],
    queryData: {
      params: { id: taskId },
    },
    enabled,
    staleTime: 1000 * 60, // VNC URL doesn't change often
    retry: false, // Don't retry 404s
  });
}
