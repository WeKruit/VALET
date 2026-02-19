// Response types for the Sandbox Agent HTTP API

export interface DeployResult {
  success: boolean;
  message: string;
  imageTag: string;
  elapsedMs?: number;
}

export interface BuildResult {
  success: boolean;
  message: string;
  imageTag?: string;
  elapsedMs?: number;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: "running" | "exited" | "created" | "restarting";
  ports: string[];
  createdAt: string;
  labels: Record<string, string>;
}

export interface WorkerStartConfig {
  workerId?: string;
  maxConcurrentJobs?: number;
  envOverrides?: Record<string, string>;
}

export interface WorkerResult {
  success: boolean;
  workerId: string;
  message: string;
}

export interface DrainResult {
  success: boolean;
  drainedWorkers: number;
  message: string;
}

export interface WorkerInfo {
  workerId: string;
  containerId: string;
  containerName: string;
  status: "running" | "idle" | "busy" | "draining" | "stopped";
  activeJobs: number;
  statusPort: number;
  uptime: number;
  image: string;
}

export interface EnvVarMap {
  /** Key-value pairs. Values for sensitive keys are redacted to "***" */
  vars: Record<string, string>;
  /** List of keys that were redacted */
  redactedKeys: string[];
}

export interface LogOptions {
  service?: "api" | "worker" | "deploy-server" | "adspower" | "system";
  lines?: number;
  since?: string; // ISO timestamp
}

export interface LogStreamOptions {
  service?: string;
}

export interface LogResult {
  lines: LogLine[];
  service: string;
  truncated: boolean;
}

export interface LogLine {
  timestamp: string;
  level?: string;
  message: string;
  service: string;
}

export interface AgentHealthResponse {
  status: "ok" | "degraded" | "error";
  activeWorkers: number;
  deploySafe: boolean;
  apiHealthy: boolean;
  workerStatus: string;
  currentDeploy: { imageTag: string; elapsedMs: number } | null;
  uptimeMs: number;
}

export interface AgentStatusResponse {
  agentVersion: string;
  machineType: string;
  hostname: string;
  os: { platform: string; release: string; arch: string };
  docker: { version: string; containers: ContainerInfo[] };
  workers: WorkerInfo[];
  uptime: number;
}

export interface AgentMetricsResponse {
  cpu: { usagePercent: number; cores: number };
  memory: { usedMb: number; totalMb: number; usagePercent: number };
  disk: { usedGb: number; totalGb: number; usagePercent: number };
  network: { rxBytesPerSec: number; txBytesPerSec: number };
}

export interface AgentVersionResponse {
  agentVersion: string;
  ghosthandsVersion: string | null;
  dockerVersion: string;
  os: string;
  arch: string;
}

export interface TakeoverInfo {
  novncUrl: string | null;
  vncPort: number | null;
  websockifyPort: number | null;
  activeSession: { jobId: string; pageUrl: string } | null;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  elapsedMs: number;
  truncated: boolean;
}
