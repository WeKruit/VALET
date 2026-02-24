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

export interface SyncTargetResult {
  target: string;
  success: boolean;
  pushed: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface SyncResult {
  environment: string;
  results: SyncTargetResult[];
  totalPushed: number;
  totalFailed: number;
  triggeredAt: string;
  triggeredBy: string;
  durationMs: number;
}

export interface FleetRefreshResult {
  refreshed: Array<{ sandboxId: string; name: string; ip: string | null; status: string }>;
  failed: Array<{ sandboxId: string; name: string; ip: string | null; error: string }>;
  skipped: Array<{ sandboxId: string; name: string; reason: string }>;
}

export interface SandboxRefreshResult {
  sandboxId: string;
  name: string;
  ip: string;
  success: boolean;
  message: string;
}

export interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
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
      qc.invalidateQueries({
        queryKey: ["admin", "secrets", "audit"],
      });
    },
  });
}

export function useRefreshFleet() {
  return useMutation<FleetRefreshResult, Error>({
    mutationFn: () =>
      fetchWithAuth(`${API_BASE_URL}/api/v1/admin/secrets/refresh-fleet`, {
        method: "POST",
      }),
  });
}

export function useRefreshSandbox() {
  return useMutation<SandboxRefreshResult, Error, { sandboxId: string }>({
    mutationFn: ({ sandboxId }) =>
      fetchWithAuth(`${API_BASE_URL}/api/v1/admin/secrets/refresh-sandbox/${sandboxId}`, {
        method: "POST",
      }),
  });
}

// --- CRUD types ---
export interface SecretVar {
  key: string;
  value: string;
  isRuntime: boolean;
}

export interface SecretVarsResponse {
  environment: string;
  project: string;
  secretId: string;
  vars: SecretVar[];
  lastModified?: string;
  totalKeys: number;
}

export interface UpsertVarsResult {
  upserted: number;
  keys: string[];
}

export interface DeleteVarsResult {
  deleted: number;
  keys: string[];
}

// --- CRUD hooks ---
export function useSecretVars(env: "staging" | "production", project: "valet" | "ghosthands") {
  return useQuery<SecretVarsResponse>({
    queryKey: ["admin", "secrets", "vars", env, project],
    queryFn: () =>
      fetchWithAuth(`${API_BASE_URL}/api/v1/admin/secrets/vars?env=${env}&project=${project}`),
    staleTime: 1000 * 30,
  });
}

export function useUpsertSecretVars() {
  const qc = useQueryClient();
  return useMutation<
    UpsertVarsResult,
    Error,
    { env: string; project: string; vars: Array<{ key: string; value: string }> }
  >({
    mutationFn: (body) =>
      fetchWithAuth(`${API_BASE_URL}/api/v1/admin/secrets/vars`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({
        queryKey: ["admin", "secrets", "vars", variables.env, variables.project],
      });
      qc.invalidateQueries({
        queryKey: ["admin", "secrets", "audit"],
      });
    },
  });
}

export function useDeleteSecretVars() {
  const qc = useQueryClient();
  return useMutation<DeleteVarsResult, Error, { env: string; project: string; keys: string[] }>({
    mutationFn: (body) =>
      fetchWithAuth(`${API_BASE_URL}/api/v1/admin/secrets/vars`, {
        method: "DELETE",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({
        queryKey: ["admin", "secrets", "vars", variables.env, variables.project],
      });
      qc.invalidateQueries({
        queryKey: ["admin", "secrets", "audit"],
      });
    },
  });
}

export function useSecretsAudit(env?: string, limit = 50) {
  return useQuery<{ entries: AuditEntry[] }>({
    queryKey: ["admin", "secrets", "audit", env, limit],
    queryFn: () => {
      const params = new URLSearchParams();
      if (env) params.set("env", env);
      params.set("limit", String(limit));
      return fetchWithAuth(`${API_BASE_URL}/api/v1/admin/secrets/audit?${params.toString()}`);
    },
    staleTime: 1000 * 30,
  });
}
