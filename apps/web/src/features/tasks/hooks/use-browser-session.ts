import { api } from "@/lib/api-client";

/**
 * Create a browser liveview session for a paused task.
 * Returns a mutation that calls POST /api/v1/tasks/:id/liveview/session
 * and opens the returned URL in a new tab.
 */
export function useCreateBrowserSession() {
  return api.tasks.createLiveviewSession.useMutation({
    onSuccess: (data) => {
      if (data.status === 200 && data.body.url) {
        window.open(data.body.url, "_blank");
      }
    },
  });
}
