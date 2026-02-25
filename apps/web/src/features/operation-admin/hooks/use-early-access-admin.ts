import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface UseEarlyAccessListParams {
  page?: number;
  limit?: number;
  emailStatus?: "pending" | "sent" | "promoted" | "failed";
  search?: string;
}

export function useEarlyAccessList(params?: UseEarlyAccessListParams) {
  return api.earlyAccessAdmin.list.useQuery({
    queryKey: ["operation-admin", "early-access", params],
    queryData: {
      query: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 25,
        ...(params?.emailStatus ? { emailStatus: params.emailStatus } : {}),
        ...(params?.search ? { search: params.search } : {}),
      },
    },
    staleTime: 1000 * 15,
    refetchInterval: 1000 * 30,
  });
}

export function useEarlyAccessStats() {
  return api.earlyAccessAdmin.stats.useQuery({
    queryKey: ["operation-admin", "early-access", "stats"],
    queryData: {},
    staleTime: 1000 * 30,
  });
}

export function usePromoteEarlyAccess() {
  const qc = useQueryClient();
  return api.earlyAccessAdmin.promote.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operation-admin", "early-access"] });
    },
  });
}

export function useResendEarlyAccess() {
  const qc = useQueryClient();
  return api.earlyAccessAdmin.resend.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operation-admin", "early-access"] });
    },
  });
}

export function useRemoveEarlyAccess() {
  const qc = useQueryClient();
  return api.earlyAccessAdmin.remove.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operation-admin", "early-access"] });
    },
  });
}
