import { api } from "@/lib/api-client";

export function useProofPack(taskId: string, enabled = true) {
  return api.tasks.getProof.useQuery({
    queryKey: ["tasks", taskId, "proof"],
    queryData: {
      params: { id: taskId },
    },
    enabled: Boolean(taskId) && enabled,
    staleTime: 1000 * 60 * 5,
  });
}
