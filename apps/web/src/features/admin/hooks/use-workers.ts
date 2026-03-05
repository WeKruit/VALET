import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, getAccessToken } from "@/lib/api-client";

async function fetchWithAuth(url: string) {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { headers, credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = (body as Record<string, unknown> | null)?.error;
    throw new Error(typeof msg === "string" ? msg : `Request failed: ${res.status}`);
  }
  return res.json();
}

async function postWithAuth(url: string, body?: unknown) {
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
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const msg = (data as Record<string, unknown> | null)?.error;
    throw new Error(typeof msg === "string" ? msg : `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface WorkerEntry {
  worker_id: string;
  sandbox_id: string | null;
  sandbox_name: string | null;
  environment: string | null;
  ec2_ip: string | null;
  status: string;
  current_job_id: string | null;
  valet_task_id: string | null;
  registered_at: string;
  last_heartbeat: string;
  jobs_completed: number;
  jobs_failed: number;
  uptime_seconds: number | null;
  ec2_state: string | null;
  active_jobs: number | null;
  transitioning: boolean;
  source: "atm" | "gh";
  atm_unverified?: boolean;
}

export interface WorkerFleetResponse {
  workers: WorkerEntry[];
  total: number;
  source: "atm" | "gh";
}

export function useWorkerFleet() {
  return useQuery<WorkerFleetResponse>({
    queryKey: ["admin", "workers"],
    queryFn: () => fetchWithAuth(`${API_BASE_URL}/api/v1/admin/workers`),
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 15,
  });
}

export function useDeregisterWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workerId,
      reason,
      cancelActiveJobs,
    }: {
      workerId: string;
      reason: string;
      cancelActiveJobs?: boolean;
    }) =>
      postWithAuth(
        `${API_BASE_URL}/api/v1/admin/workers/${encodeURIComponent(workerId)}/deregister`,
        { reason, cancel_active_jobs: cancelActiveJobs },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "workers"] });
    },
  });
}
