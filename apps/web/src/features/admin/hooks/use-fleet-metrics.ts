import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, getAccessToken } from "@/lib/api-client";

// ─── Helpers ───

async function fetchWithAuth<T>(url: string): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { headers, credentials: "include" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function postWithAuth<T>(url: string, body?: unknown): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    credentials: "include",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Types ───

export interface SandboxMetrics {
  sandboxId: string;
  cpu: number | null;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
  diskUsedGb: number | null;
  diskTotalGb: number | null;
  activeProfiles: number;
  adspowerStatus: string;
  uptime: number | null;
}

export interface DrainResponse {
  success: boolean;
  drainedWorkers: number;
  message: string;
  workerId: string;
  sandboxId: string;
  sandboxName: string;
}

// ─── Hooks ───

/**
 * Fetch resource metrics (CPU, memory, disk) for a specific sandbox.
 * Uses the existing GET /api/v1/admin/sandboxes/:id/metrics endpoint.
 */
export function useFleetSandboxMetrics(sandboxId: string) {
  return useQuery<SandboxMetrics>({
    queryKey: ["admin", "fleet", sandboxId, "metrics"],
    queryFn: () =>
      fetchWithAuth<SandboxMetrics>(
        `${API_BASE_URL}/api/v1/admin/sandboxes/${encodeURIComponent(sandboxId)}/metrics`,
      ),
    enabled: Boolean(sandboxId),
    staleTime: 1000 * 5,
    refetchInterval: 1000 * 15,
    retry: false,
  });
}

/**
 * Drain a worker via the ATM agent on its sandbox.
 * Calls POST /api/v1/admin/workers/:workerId/drain.
 */
export function useDrainWorker() {
  const qc = useQueryClient();
  return useMutation<DrainResponse, Error, { workerId: string }>({
    mutationFn: ({ workerId }) =>
      postWithAuth<DrainResponse>(
        `${API_BASE_URL}/api/v1/admin/workers/${encodeURIComponent(workerId)}/drain`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "workers"] });
    },
  });
}
