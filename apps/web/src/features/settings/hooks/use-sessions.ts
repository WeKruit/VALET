import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

export function useSessions() {
  return api.users.listSessions.useQuery({
    queryKey: ["sessions"],
    queryData: {},
    staleTime: 1000 * 15,
    refetchInterval: 1000 * 30,
  });
}

export function useClearSession() {
  const qc = useQueryClient();
  return api.users.deleteSession.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(`Session for ${variables.params.domain} cleared.`);
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: () => {
      toast.error("Failed to clear session. Please try again.");
    },
  });
}

export function useClearAllSessions() {
  const qc = useQueryClient();
  return api.users.clearAllSessions.useMutation({
    onSuccess: (data) => {
      const count = data.status === 200 ? data.body.deletedCount : 0;
      toast.success(`${count} session${count === 1 ? "" : "s"} cleared.`);
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: () => {
      toast.error("Failed to clear sessions. Please try again.");
    },
  });
}
