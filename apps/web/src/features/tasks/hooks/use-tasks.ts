import { api } from "@/lib/api-client";

export function useTasks(params?: { page?: number; status?: string }) {
  return api.tasks.list.useQuery({
    queryKey: ["tasks", params],
    queryData: {
      query: {
        page: params?.page ?? 1,
        pageSize: 20,
        ...(params?.status && { status: params.status as any }),
        sortBy: "createdAt" as const,
        sortOrder: "desc" as const,
      },
    },
    staleTime: 1000 * 30,
  });
}

export function useTask(taskId: string) {
  return api.tasks.getById.useQuery({
    queryKey: ["tasks", taskId],
    queryData: {
      params: { id: taskId },
    },
    enabled: Boolean(taskId),
  });
}
