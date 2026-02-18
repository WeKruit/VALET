import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL, getAccessToken } from "@/lib/api-client";

async function fetchWithAuth(url: string) {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { headers, credentials: "include" });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

export interface HealthCheck {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs?: number;
  message?: string;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version?: string;
  uptime?: number;
  checks: HealthCheck[];
}

export interface MetricsResponse {
  jobs: {
    created: number;
    completed: number;
    failed: number;
    retried?: number;
    totalDurationMs?: number;
    avgDurationMs?: number;
  };
  llm?: {
    calls: number;
    totalTokens?: number;
    totalCostUsd?: number;
    [key: string]: unknown;
  };
  worker: {
    activeJobs: number;
    maxConcurrent?: number;
    totalProcessed?: number;
    queueDepth: number;
  };
  api?: {
    totalRequests?: number;
    [key: string]: unknown;
  };
  uptime?: number;
  [key: string]: unknown;
}

export interface MonitoringAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
  affectedJobIds?: string[];
  createdAt: string;
}

export interface AlertsResponse {
  alerts: MonitoringAlert[];
  count: number;
}

export function useGhHealth() {
  return useQuery<HealthResponse>({
    queryKey: ["admin", "monitoring", "health"],
    queryFn: () => fetchWithAuth(`${API_BASE_URL}/api/v1/admin/monitoring/health`),
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 30,
  });
}

export function useGhMetrics() {
  return useQuery<MetricsResponse>({
    queryKey: ["admin", "monitoring", "metrics"],
    queryFn: () => fetchWithAuth(`${API_BASE_URL}/api/v1/admin/monitoring/metrics`),
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 30,
  });
}

export function useGhAlerts() {
  return useQuery<AlertsResponse>({
    queryKey: ["admin", "monitoring", "alerts"],
    queryFn: () => fetchWithAuth(`${API_BASE_URL}/api/v1/admin/monitoring/alerts`),
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 30,
  });
}
