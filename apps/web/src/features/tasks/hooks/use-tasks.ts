import { api } from "@/lib/api-client";

export interface UseTasksParams {
  page?: number;
  status?: string;
  platform?: string;
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "status" | "jobTitle" | "companyName";
  sortOrder?: "asc" | "desc";
}

export function useTasks(params?: UseTasksParams) {
  return api.tasks.list.useQuery({
    queryKey: ["tasks", params],
    queryData: {
      query: {
        page: params?.page ?? 1,
        pageSize: 20,
        ...(params?.status && { status: params.status as any }),
        ...(params?.platform && { platform: params.platform as any }),
        ...(params?.search && { search: params.search }),
        sortBy: (params?.sortBy ?? "createdAt") as any,
        sortOrder: (params?.sortOrder ?? "desc") as any,
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
