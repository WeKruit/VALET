import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

export function useClearAllSessions() {
  const qc = useQueryClient();
  return api.users.clearAllSessions.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}
