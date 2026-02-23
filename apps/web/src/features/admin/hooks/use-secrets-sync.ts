import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, getAccessToken } from "@/lib/api-client";

// Types
export interface TargetDiff {
  target: string;
  targetType: "fly" | "gh-actions" | "aws-sm";
  role: string;
  totalRefKeys: number;
  totalDeployedKeys: number;
  missing: string[];
  extra: string[];
  matched: number;
  mismatched: number;
  status: "synced" | "drifted" | "error" | "unavailable";
  error?: string;
  lastChecked: string;
}

export interface SecretsDiffResponse {
  environment: string;
  targets: TargetDiff[];
  summary: {
    total: number;
    synced: number;
    drifted: number;
    errors: number;
    unavailable: number;
  };
}

export interface SyncResult {
  environment: string;
  results: Array<{ target: string; success: boolean; error?: string }>;
  triggeredAt: string;
  triggeredBy: string;
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

export function useSecretsDiff(env: "staging" | "production") {
  return useQuery<SecretsDiffResponse>({
    queryKey: ["admin", "secrets", "diff", env],
    queryFn: () => fetchWithAuth(`${API_BASE_URL}/api/v1/admin/secrets/diff?env=${env}`),
    staleTime: 1000 * 60,
    enabled: false,
  });
}

export function useSyncSecrets() {
  const qc = useQueryClient();
  return useMutation<SyncResult, Error, { env: string; targets?: string[] }>({
    mutationFn: (body) =>
      fetchWithAuth(`${API_BASE_URL}/api/v1/admin/secrets/sync`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({
        queryKey: ["admin", "secrets", "diff", variables.env],
      });
    },
  });
}
