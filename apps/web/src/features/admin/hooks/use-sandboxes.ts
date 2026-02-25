import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE_URL, getAccessToken } from "@/lib/api-client";
import type { Ec2Status, SandboxEnvironment, SandboxStatus, SandboxHealthStatus } from "../types";

export interface UseSandboxesParams {
  page?: number;
  pageSize?: number;
  environment?: SandboxEnvironment;
  status?: SandboxStatus;
  healthStatus?: SandboxHealthStatus;
  ec2Status?: Ec2Status;
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "name" | "status" | "healthStatus";
  sortOrder?: "asc" | "desc";
}

export function useSandboxes(params?: UseSandboxesParams) {
  return api.sandboxes.list.useQuery({
    queryKey: ["admin", "sandboxes", params],
    queryData: {
      query: {
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 20,
        ...(params?.environment && { environment: params.environment }),
        ...(params?.status && { status: params.status }),
        ...(params?.healthStatus && { healthStatus: params.healthStatus }),
        ...(params?.ec2Status && { ec2Status: params.ec2Status }),
        ...(params?.search && { search: params.search }),
        sortBy: (params?.sortBy ?? "createdAt") as any,
        sortOrder: (params?.sortOrder ?? "desc") as any,
      },
    },
    staleTime: 1000 * 15,
    refetchInterval: 1000 * 30,
  });
}

export function useSandbox(id: string) {
  return api.sandboxes.getById.useQuery({
    queryKey: ["admin", "sandboxes", id],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id),
    staleTime: 1000 * 10,
  });
}

export function useSandboxMetrics(id: string) {
  return api.sandboxes.metrics.useQuery({
    queryKey: ["admin", "sandboxes", id, "metrics"],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id),
    staleTime: 1000 * 5,
    refetchInterval: 1000 * 15,
    retry: false,
  });
}

export function useCreateSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.create.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
    },
  });
}

export function useUpdateSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.update.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
    },
  });
}

export function useDeleteSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.delete.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
    },
  });
}

export function useHealthCheckSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.healthCheck.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
    },
  });
}

export function useRestartSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.restart.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
    },
  });
}

export function useEc2Status(id: string) {
  return api.sandboxes.getEc2Status.useQuery({
    queryKey: ["admin", "sandboxes", id, "ec2-status"],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id),
    staleTime: 1000 * 5,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === 200) {
        const status = data.body.ec2Status;
        if (status === "pending" || status === "stopping") {
          return 5000;
        }
      }
      return false;
    },
  });
}

export function useStartSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.startSandbox.useMutation({
    onMutate: async (variables) => {
      const id = variables.params.id;
      await qc.cancelQueries({ queryKey: ["admin", "sandboxes", id] });
      const previous = qc.getQueryData(["admin", "sandboxes", id]);
      qc.setQueryData(["admin", "sandboxes", id], (old: any) =>
        old ? { ...old, body: { ...old.body, ec2Status: "pending" } } : old,
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        qc.setQueryData(["admin", "sandboxes", variables.params.id], context.previous);
      }
    },
    onSettled: (_data, _err, variables) => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
      qc.invalidateQueries({
        queryKey: ["admin", "sandboxes", variables.params.id, "ec2-status"],
      });
    },
  });
}

export function useTriggerTask() {
  const qc = useQueryClient();
  return api.sandboxes.triggerTask.useMutation({
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
      qc.invalidateQueries({
        queryKey: ["admin", "sandboxes", variables.params.id, "worker-status"],
      });
    },
  });
}

export function useTriggerTest() {
  const qc = useQueryClient();
  return api.sandboxes.triggerTest.useMutation({
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
      qc.invalidateQueries({
        queryKey: ["admin", "sandboxes", variables.params.id, "worker-status"],
      });
    },
  });
}

export function useWorkerStatus(id: string, enabled = true) {
  return api.sandboxes.workerStatus.useQuery({
    queryKey: ["admin", "sandboxes", id, "worker-status"],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id) && enabled,
    staleTime: 1000 * 5,
    refetchInterval: 1000 * 10,
    retry: false,
  });
}

export function useDeepHealthCheck(id: string, enabled = true) {
  return api.sandboxes.deepHealthCheck.useQuery({
    queryKey: ["admin", "sandboxes", id, "deep-health"],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id) && enabled,
    staleTime: 1000 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

// ─── Deploy Management ───

export function useDeploys() {
  return api.sandboxes.listDeploys.useQuery({
    queryKey: ["admin", "deploys"],
    queryData: {},
    staleTime: 1000 * 5,
    refetchInterval: 1000 * 10,
  });
}

export function useDeployStatus(id: string, enabled = true) {
  return api.sandboxes.getDeployStatus.useQuery({
    queryKey: ["admin", "deploys", id],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id) && enabled,
    staleTime: 1000 * 2,
    refetchInterval: 1000 * 3,
  });
}

export function useTriggerDeploy() {
  const qc = useQueryClient();
  return api.sandboxes.triggerDeploy.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "deploys"] });
    },
  });
}

export function useCancelDeploy() {
  const qc = useQueryClient();
  return api.sandboxes.cancelDeploy.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "deploys"] });
    },
  });
}

export function useStopSandbox() {
  const qc = useQueryClient();
  return api.sandboxes.stopSandbox.useMutation({
    onMutate: async (variables) => {
      const id = variables.params.id;
      await qc.cancelQueries({ queryKey: ["admin", "sandboxes", id] });
      const previous = qc.getQueryData(["admin", "sandboxes", id]);
      qc.setQueryData(["admin", "sandboxes", id], (old: any) =>
        old ? { ...old, body: { ...old.body, ec2Status: "stopping" } } : old,
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        qc.setQueryData(["admin", "sandboxes", variables.params.id], context.previous);
      }
    },
    onSettled: (_data, _err, variables) => {
      qc.invalidateQueries({ queryKey: ["admin", "sandboxes"] });
      qc.invalidateQueries({
        queryKey: ["admin", "sandboxes", variables.params.id, "ec2-status"],
      });
    },
  });
}

// ─── Agent Queries (Workers, Containers, Audit, Deploy History) ───

export function useAgentWorkers(id: string, enabled = true) {
  return api.sandboxes.listWorkers.useQuery({
    queryKey: ["admin", "sandboxes", id, "agent-workers"],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id) && enabled,
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 15,
    retry: false,
  });
}

export function useAgentContainers(id: string, enabled = true) {
  return api.sandboxes.listContainers.useQuery({
    queryKey: ["admin", "sandboxes", id, "agent-containers"],
    queryData: {
      params: { id },
    },
    enabled: Boolean(id) && enabled,
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 15,
    retry: false,
  });
}

export function useAuditLog(
  id: string,
  params?: { page?: number; pageSize?: number; action?: string },
) {
  return api.sandboxes.getAuditLog.useQuery({
    queryKey: ["admin", "sandboxes", id, "audit-log", params],
    queryData: {
      params: { id },
      query: {
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 20,
        ...(params?.action ? { action: params.action } : {}),
      },
    },
    enabled: Boolean(id),
    staleTime: 1000 * 15,
  });
}

export function useDeployHistory(id: string, params?: { page?: number; pageSize?: number }) {
  return api.sandboxes.getDeployHistory.useQuery({
    queryKey: ["admin", "sandboxes", id, "deploy-history", params],
    queryData: {
      params: { id },
      query: {
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 20,
      },
    },
    enabled: Boolean(id),
    staleTime: 1000 * 15,
  });
}

// ─── Auto-deploy Config ───

interface AutoDeployConfig {
  autoDeployStaging: boolean;
  autoDeployProd: boolean;
}

async function fetchWithAuth<T>(
  url: string,
  options?: { method?: string; body?: string },
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...options, headers, credentials: "include" });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useAutoDeployConfig() {
  return useQuery<AutoDeployConfig>({
    queryKey: ["admin", "deploys", "config"],
    queryFn: () => fetchWithAuth<AutoDeployConfig>(`${API_BASE_URL}/api/v1/admin/deploys/config`),
    staleTime: 1000 * 30,
  });
}

export function useUpdateAutoDeployConfig() {
  const qc = useQueryClient();
  return useMutation<AutoDeployConfig, Error, Partial<AutoDeployConfig>>({
    mutationFn: (body) =>
      fetchWithAuth<AutoDeployConfig>(`${API_BASE_URL}/api/v1/admin/deploys/config`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "deploys", "config"] });
    },
  });
}

// ─── ATM Integration ───
// These hooks use fetchWithAuth (manual fetch) since the ATM endpoints are not
// part of the ts-rest contract. All gracefully handle 404/empty responses so the
// UI is backward-compatible with sandboxes that run the legacy deploy-server.

export interface AtmDeployRecord {
  id: string;
  imageTag: string;
  status: "deploying" | "completed" | "failed" | "rolled_back";
  triggeredBy: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  commitSha: string | null;
  error: string | null;
}

export interface AtmKamalStatus {
  available: boolean;
  locked: boolean;
  lockedBy: string | null;
  lockReason: string | null;
  version: string | null;
}

export interface AtmKamalAuditEntry {
  id: string;
  action: string;
  performer: string;
  destination: string | null;
  version: string | null;
  status: "success" | "failure";
  createdAt: string;
  durationMs: number | null;
  error: string | null;
}

export interface AtmSecretsStatus {
  connected: boolean;
  provider: string;
  projectId: string | null;
  environment: string | null;
  secretCount: number;
  lastSyncAt: string | null;
}

/**
 * Variant of fetchWithAuth that returns null instead of throwing on 404/500.
 * Used by ATM hooks so the UI gracefully degrades for legacy sandboxes.
 */
async function fetchAtm<T>(
  url: string,
  options?: { method?: string; body?: string },
): Promise<T | null> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...options, headers, credentials: "include" });
  if (res.status === 404 || res.status === 501) return null;
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export function useAtmEnabled(sandboxId: string) {
  return useQuery<{ enabled: boolean }>({
    queryKey: ["admin", "sandboxes", sandboxId, "atm", "enabled"],
    queryFn: async () => {
      const result = await fetchAtm<{ enabled: boolean }>(
        `${API_BASE_URL}/api/v1/admin/sandboxes/${sandboxId}/atm/enabled`,
      );
      return result ?? { enabled: false };
    },
    enabled: Boolean(sandboxId),
    staleTime: 1000 * 60,
  });
}

export function useAtmDeployHistory(sandboxId: string, enabled = true) {
  return useQuery<AtmDeployRecord[]>({
    queryKey: ["admin", "sandboxes", sandboxId, "atm", "deploys"],
    queryFn: async () => {
      const result = await fetchAtm<AtmDeployRecord[]>(
        `${API_BASE_URL}/api/v1/admin/sandboxes/${sandboxId}/atm/deploys`,
      );
      return result ?? [];
    },
    enabled: Boolean(sandboxId) && enabled,
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 30,
  });
}

export function useAtmRollback(sandboxId: string) {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, void>({
    mutationFn: () =>
      fetchWithAuth<{ success: boolean }>(
        `${API_BASE_URL}/api/v1/admin/sandboxes/${sandboxId}/atm/rollback`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["admin", "sandboxes", sandboxId, "atm", "deploys"],
      });
    },
  });
}

export function useAtmKamalStatus(sandboxId: string, enabled = true) {
  return useQuery<AtmKamalStatus | null>({
    queryKey: ["admin", "sandboxes", sandboxId, "atm", "kamal-status"],
    queryFn: () =>
      fetchAtm<AtmKamalStatus>(
        `${API_BASE_URL}/api/v1/admin/sandboxes/${sandboxId}/atm/kamal-status`,
      ),
    enabled: Boolean(sandboxId) && enabled,
    staleTime: 1000 * 15,
  });
}

export function useAtmKamalAudit(sandboxId: string, enabled = true) {
  return useQuery<AtmKamalAuditEntry[]>({
    queryKey: ["admin", "sandboxes", sandboxId, "atm", "kamal-audit"],
    queryFn: async () => {
      const result = await fetchAtm<AtmKamalAuditEntry[]>(
        `${API_BASE_URL}/api/v1/admin/sandboxes/${sandboxId}/atm/kamal-audit`,
      );
      return result ?? [];
    },
    enabled: Boolean(sandboxId) && enabled,
    staleTime: 1000 * 15,
  });
}

export function useAtmKamalDeploy(sandboxId: string) {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, { destination?: string; version?: string }>({
    mutationFn: (body) =>
      fetchWithAuth<{ success: boolean }>(
        `${API_BASE_URL}/api/v1/admin/sandboxes/${sandboxId}/atm/deploy-kamal`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["admin", "sandboxes", sandboxId, "atm", "kamal-status"],
      });
      qc.invalidateQueries({
        queryKey: ["admin", "sandboxes", sandboxId, "atm", "kamal-audit"],
      });
    },
  });
}

export function useAtmKamalRollback(sandboxId: string) {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, { destination?: string; version: string }>({
    mutationFn: (body) =>
      fetchWithAuth<{ success: boolean }>(
        `${API_BASE_URL}/api/v1/admin/sandboxes/${sandboxId}/atm/rollback-kamal`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["admin", "sandboxes", sandboxId, "atm", "kamal-status"],
      });
      qc.invalidateQueries({
        queryKey: ["admin", "sandboxes", sandboxId, "atm", "kamal-audit"],
      });
    },
  });
}

export function useAtmSecretsStatus(sandboxId: string, enabled = true) {
  return useQuery<AtmSecretsStatus | null>({
    queryKey: ["admin", "sandboxes", sandboxId, "atm", "secrets-status"],
    queryFn: () =>
      fetchAtm<AtmSecretsStatus>(
        `${API_BASE_URL}/api/v1/admin/sandboxes/${sandboxId}/atm/secrets-status`,
      ),
    enabled: Boolean(sandboxId) && enabled,
    staleTime: 1000 * 30,
  });
}
