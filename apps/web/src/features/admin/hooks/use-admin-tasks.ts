import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, getAccessToken } from "@/lib/api-client";

export interface AdminTasksParams {
  page?: number;
  pageSize?: number;
  status?: string;
  platform?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GhJobError {
  code: string;
  message: string;
}

export interface GhJobCost {
  totalCostUsd: number;
  actionCount: number;
  totalTokens: number;
}

export interface GhJobTimestamps {
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface GhJobInfo {
  jobId: string;
  ghStatus: string;
  executionMode?: string | null;
  statusMessage?: string | null;
  error?: GhJobError | null;
  cost?: GhJobCost | null;
  timestamps: GhJobTimestamps;
  targetWorkerId?: string | null;
}

export interface AdminTask {
  id: string;
  userId: string;
  jobUrl: string;
  jobTitle?: string | null;
  companyName?: string | null;
  platform: string;
  status: string;
  workflowRunId?: string | null;
  createdAt: string;
  updatedAt: string;
  ghJob?: GhJobInfo | null;
}

export interface AdminTasksResponse {
  data: AdminTask[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

async function fetchWithAuth(url: string, init?: globalThis.RequestInit) {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

export function useAdminTasks(params?: AdminTasksParams) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.status) qs.set("status", params.status);
  if (params?.platform) qs.set("platform", params.platform);
  if (params?.search) qs.set("search", params.search);
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);

  return useQuery<AdminTasksResponse>({
    queryKey: ["admin", "tasks", params],
    queryFn: () => fetchWithAuth(`${API_BASE_URL}/api/v1/admin/tasks?${qs.toString()}`),
    staleTime: 1000 * 15,
    refetchInterval: 1000 * 30,
  });
}

export function useSyncTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      fetchWithAuth(`${API_BASE_URL}/api/v1/admin/tasks/${taskId}/sync`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "tasks"] });
    },
  });
}
