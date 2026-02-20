import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL, getAccessToken } from "@/lib/api-client";

export interface GhJobEvent {
  id: string;
  eventType: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  actor: string | null;
  createdAt: string;
}

export function useTaskEvents(taskId: string, enabled: boolean) {
  return useQuery<{ events: GhJobEvent[] }>({
    queryKey: ["tasks", taskId, "gh-events"],
    queryFn: async () => {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/api/v1/tasks/${taskId}/gh-events?limit=200`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
    enabled,
    staleTime: 3000,
    refetchInterval: enabled ? 5000 : false,
  });
}
