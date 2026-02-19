import { z } from "zod";

// ─── Enums ───
export const sandboxStatus = z.enum([
  "provisioning",
  "active",
  "stopping",
  "stopped",
  "terminated",
  "unhealthy",
]);

export const sandboxHealthStatus = z.enum(["healthy", "degraded", "unhealthy"]);

export const sandboxEnvironment = z.enum(["dev", "staging", "prod"]);

export const browserEngine = z.enum(["chromium", "adspower"]);

export const ec2Status = z.enum(["pending", "running", "stopping", "stopped", "terminated"]);

export const chromiumConfigSchema = z.object({
  headless: z.boolean().default(true),
  executablePath: z.string().optional(),
  args: z.array(z.string()).optional(),
});

export const adspowerConfigSchema = z.object({
  apiUrl: z.string().url().optional(),
  profileId: z.string().optional(),
  groupId: z.string().optional(),
});

export const browserConfigSchema = z.union([chromiumConfigSchema, adspowerConfigSchema]);

// ─── Base Entity (mirrors DB row) ───
export const sandboxSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  environment: sandboxEnvironment,
  instanceId: z.string(),
  instanceType: z.string(),
  publicIp: z.string().nullable().optional(),
  privateIp: z.string().nullable().optional(),
  status: sandboxStatus,
  healthStatus: sandboxHealthStatus,
  lastHealthCheckAt: z.coerce.date().nullable().optional(),
  capacity: z.number().int(),
  currentLoad: z.number().int(),
  sshKeyName: z.string().nullable().optional(),
  novncUrl: z.string().nullable().optional(),
  adspowerVersion: z.string().nullable().optional(),
  browserEngine: browserEngine,
  browserConfig: z.record(z.unknown()).nullable().optional(),
  tags: z.record(z.unknown()).nullable().optional(),
  ec2Status: ec2Status.nullable().optional(),
  lastStartedAt: z.coerce.date().nullable().optional(),
  lastStoppedAt: z.coerce.date().nullable().optional(),
  autoStopEnabled: z.boolean().optional(),
  idleMinutesBeforeStop: z.number().int().optional(),
  machineType: z.string().default("ec2").optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─── Request DTOs ───
export const sandboxCreateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .transform((s) => s.trim()),
  environment: sandboxEnvironment,
  instanceId: z.string().min(1).max(50),
  instanceType: z.string().min(1).max(50),
  publicIp: z.string().max(45).optional(),
  privateIp: z.string().max(45).optional(),
  capacity: z.number().int().min(1).max(100).default(5),
  sshKeyName: z.string().max(255).optional(),
  novncUrl: z.string().url().optional(),
  adspowerVersion: z.string().max(50).optional(),
  browserEngine: browserEngine.default("adspower"),
  browserConfig: z.record(z.unknown()).optional(),
  tags: z.record(z.unknown()).optional(),
  machineType: z.enum(["ec2", "macos", "local_docker"]).default("ec2").optional(),
});

export const sandboxUpdateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .transform((s) => s.trim())
    .optional(),
  status: sandboxStatus.optional(),
  publicIp: z.string().max(45).nullable().optional(),
  privateIp: z.string().max(45).nullable().optional(),
  capacity: z.number().int().min(1).max(100).optional(),
  sshKeyName: z.string().max(255).nullable().optional(),
  novncUrl: z.string().url().nullable().optional(),
  adspowerVersion: z.string().max(50).nullable().optional(),
  browserEngine: browserEngine.optional(),
  browserConfig: z.record(z.unknown()).nullable().optional(),
  tags: z.record(z.unknown()).nullable().optional(),
  autoStopEnabled: z.boolean().optional(),
  idleMinutesBeforeStop: z.number().int().min(5).max(480).optional(),
});

export const sandboxListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  environment: sandboxEnvironment.optional(),
  status: sandboxStatus.optional(),
  healthStatus: sandboxHealthStatus.optional(),
  ec2Status: ec2Status.optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "name", "status", "healthStatus"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ─── Response DTOs ───
export const sandboxResponse = sandboxSchema;

export const sandboxListResponse = z.object({
  data: z.array(sandboxResponse),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export const sandboxMetricsResponse = z.object({
  sandboxId: z.string().uuid(),
  cpu: z.number().min(0).max(100).nullable(),
  memoryUsedMb: z.number().nullable(),
  memoryTotalMb: z.number().nullable(),
  diskUsedGb: z.number().nullable(),
  diskTotalGb: z.number().nullable(),
  activeProfiles: z.number().int(),
  adspowerStatus: z.string(),
  uptime: z.number().nullable(),
});

export const ec2StatusResponse = z.object({
  sandboxId: z.string().uuid(),
  ec2Status: ec2Status,
  publicIp: z.string().nullable().optional(),
  lastStartedAt: z.coerce.date().nullable().optional(),
  lastStoppedAt: z.coerce.date().nullable().optional(),
});

export const sandboxHealthCheckResponse = z.object({
  sandboxId: z.string().uuid(),
  healthStatus: sandboxHealthStatus,
  browserEngine: browserEngine.optional(),
  checkedAt: z.coerce.date(),
  details: z.record(z.unknown()).optional(),
});

// ─── Admin Trigger Task (Job Application) ───
export const adminTriggerTaskRequest = z.object({
  jobUrl: z.string().url(),
  resumeId: z.string().uuid(),
  mode: z.enum(["copilot", "autopilot"]).optional().default("autopilot"),
  notes: z.string().max(2000).optional(),
});

export const adminTriggerTaskResponse = z.object({
  taskId: z.string().uuid(),
  sandboxId: z.string().uuid(),
  targetWorkerId: z.string(),
  status: z.string(),
});

// ─── Admin Trigger Test (Quick Integration Test) ───
export const adminTriggerTestRequest = z.object({
  searchQuery: z.string().max(500).optional().default("valet integration test"),
});

export const adminTriggerTestResponse = z.object({
  taskId: z.string().uuid(),
  sandboxId: z.string().uuid(),
  status: z.string(),
});

// ─── Worker Status ───
export const workerStatus = z.enum(["healthy", "degraded", "unhealthy", "unreachable"]);

export const ghHealthCheckSchema = z.object({
  name: z.string(),
  status: z.string(),
  message: z.string().optional(),
  latencyMs: z.number().optional(),
});

export const workerStatusResponse = z.object({
  sandboxId: z.string().uuid(),
  ghosthandsApi: z.object({
    status: z.enum(["healthy", "unhealthy", "unreachable"]),
    version: z.string().nullable().optional(),
  }),
  worker: z.object({
    status: workerStatus,
    activeJobs: z.number().nullable(),
    maxConcurrent: z.number().nullable(),
    totalProcessed: z.number().nullable(),
    queueDepth: z.number().nullable(),
  }),
  ghChecks: z.array(ghHealthCheckSchema),
  jobStats: z.object({
    created: z.number(),
    completed: z.number(),
    failed: z.number(),
  }),
  dockerContainers: z.number().nullable(),
  uptime: z.number().nullable(),
  activeTasks: z.array(
    z.object({
      taskId: z.string().uuid(),
      jobUrl: z.string(),
      status: z.string(),
      progress: z.number(),
      currentStep: z.string().nullable().optional(),
      createdAt: z.coerce.date(),
    }),
  ),
  recentTasks: z.array(
    z.object({
      taskId: z.string().uuid(),
      jobUrl: z.string(),
      status: z.string(),
      completedAt: z.coerce.date().nullable().optional(),
    }),
  ),
});

// ─── Agent Status / Version ───

export const agentContainerInfo = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  status: z.string(),
  state: z.enum(["running", "exited", "created", "restarting"]),
  ports: z.array(z.string()),
  createdAt: z.string(),
  labels: z.record(z.string()),
});

export const agentWorkerInfo = z.object({
  workerId: z.string(),
  containerId: z.string(),
  containerName: z.string(),
  status: z.enum(["running", "idle", "busy", "draining", "stopped"]),
  activeJobs: z.number(),
  statusPort: z.number(),
  uptime: z.number(),
  image: z.string(),
});

export const agentStatusResponse = z.object({
  agentVersion: z.string(),
  machineType: z.string(),
  hostname: z.string(),
  os: z.object({
    platform: z.string(),
    release: z.string(),
    arch: z.string(),
  }),
  docker: z.object({
    version: z.string(),
    containers: z.array(agentContainerInfo),
  }),
  workers: z.array(agentWorkerInfo),
  uptime: z.number(),
});

export const agentVersionResponse = z.object({
  agentVersion: z.string(),
  ghosthandsVersion: z.string().nullable(),
  dockerVersion: z.string(),
  os: z.string(),
  arch: z.string(),
});

export const containerListResponse = z.object({
  data: z.array(agentContainerInfo),
});

export const workerListResponse = z.object({
  data: z.array(agentWorkerInfo),
});

// ─── Audit Log ───

export const auditLogEntry = z.object({
  id: z.string().uuid(),
  sandboxId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  action: z.string(),
  details: z.record(z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  result: z.string().nullable(),
  errorMessage: z.string().nullable(),
  durationMs: z.number().nullable(),
  createdAt: z.coerce.date(),
});

export const paginationMeta = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export const auditLogListResponse = z.object({
  data: z.array(auditLogEntry),
  pagination: paginationMeta,
});

// ─── Deploy History ───

export const deployHistoryEntry = z.object({
  id: z.string().uuid(),
  sandboxId: z.string().uuid().nullable(),
  imageTag: z.string(),
  commitSha: z.string().nullable(),
  commitMessage: z.string().nullable(),
  branch: z.string().nullable(),
  environment: z.string(),
  status: z.string(),
  triggeredBy: z.string().uuid().nullable(),
  deployStartedAt: z.coerce.date().nullable(),
  deployCompletedAt: z.coerce.date().nullable(),
  deployDurationMs: z.number().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const deployHistoryListResponse = z.object({
  data: z.array(deployHistoryEntry),
  pagination: paginationMeta,
});

// ─── Agent Health (for 502 responses) ───

export const agentHealthResponse = z.object({
  status: z.enum(["ok", "degraded", "error"]),
  activeWorkers: z.number(),
  deploySafe: z.boolean(),
  apiHealthy: z.boolean(),
  workerStatus: z.string(),
  currentDeploy: z.object({ imageTag: z.string(), elapsedMs: z.number() }).nullable(),
  uptimeMs: z.number(),
});

// ─── Deploy (GhostHands rolling update) ───

export const deployStatus = z.enum([
  "pending",
  "deploying",
  "draining",
  "completed",
  "failed",
  "cancelled",
]);

export const deploySandboxStatus = z.enum([
  "pending",
  "draining",
  "deploying",
  "completed",
  "failed",
  "skipped",
]);

export const deployNotification = z.object({
  id: z.string().uuid(),
  imageTag: z.string(),
  commitSha: z.string(),
  commitMessage: z.string(),
  branch: z.string(),
  environment: sandboxEnvironment,
  repository: z.string(),
  runUrl: z.string(),
  status: deployStatus,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const deploySandboxProgress = z.object({
  sandboxId: z.string().uuid(),
  sandboxName: z.string(),
  status: deploySandboxStatus,
  activeTaskCount: z.number().int(),
  message: z.string().nullable().optional(),
});

export const deployListResponse = z.object({
  data: z.array(deployNotification),
});

export const triggerDeployRequest = z.object({
  deployId: z.string().uuid(),
});

export const triggerDeployResponse = z.object({
  deployId: z.string().uuid(),
  status: deployStatus,
  sandboxes: z.array(deploySandboxProgress),
});

export const deployStatusResponse = z.object({
  id: z.string().uuid(),
  imageTag: z.string(),
  commitSha: z.string(),
  commitMessage: z.string(),
  branch: z.string(),
  environment: sandboxEnvironment,
  status: deployStatus,
  sandboxes: z.array(deploySandboxProgress),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─── Inferred Types (NEVER hand-write these) ───
export type Ec2Status = z.infer<typeof ec2Status>;
export type BrowserEngine = z.infer<typeof browserEngine>;
export type ChromiumConfig = z.infer<typeof chromiumConfigSchema>;
export type AdspowerConfig = z.infer<typeof adspowerConfigSchema>;
export type SandboxStatus = z.infer<typeof sandboxStatus>;
export type SandboxHealthStatus = z.infer<typeof sandboxHealthStatus>;
export type SandboxEnvironment = z.infer<typeof sandboxEnvironment>;
export type Sandbox = z.infer<typeof sandboxSchema>;
export type SandboxCreateRequest = z.infer<typeof sandboxCreateSchema>;
export type SandboxUpdateRequest = z.infer<typeof sandboxUpdateSchema>;
export type SandboxListQuery = z.infer<typeof sandboxListQuery>;
export type SandboxResponse = z.infer<typeof sandboxResponse>;
export type SandboxListResponse = z.infer<typeof sandboxListResponse>;
export type SandboxMetricsResponse = z.infer<typeof sandboxMetricsResponse>;
export type SandboxHealthCheckResponse = z.infer<typeof sandboxHealthCheckResponse>;
export type Ec2StatusResponse = z.infer<typeof ec2StatusResponse>;
export type AdminTriggerTaskRequest = z.infer<typeof adminTriggerTaskRequest>;
export type AdminTriggerTaskResponse = z.infer<typeof adminTriggerTaskResponse>;
export type AdminTriggerTestRequest = z.infer<typeof adminTriggerTestRequest>;
export type AdminTriggerTestResponse = z.infer<typeof adminTriggerTestResponse>;
export type WorkerStatus = z.infer<typeof workerStatus>;
export type WorkerStatusResponse = z.infer<typeof workerStatusResponse>;
export type DeployStatus = z.infer<typeof deployStatus>;
export type DeploySandboxStatus = z.infer<typeof deploySandboxStatus>;
export type DeployNotification = z.infer<typeof deployNotification>;
export type DeploySandboxProgress = z.infer<typeof deploySandboxProgress>;
export type DeployListResponse = z.infer<typeof deployListResponse>;
export type TriggerDeployRequest = z.infer<typeof triggerDeployRequest>;
export type TriggerDeployResponse = z.infer<typeof triggerDeployResponse>;
export type DeployStatusResponse = z.infer<typeof deployStatusResponse>;
export type AgentContainerInfo = z.infer<typeof agentContainerInfo>;
export type AgentWorkerInfo = z.infer<typeof agentWorkerInfo>;
export type AgentStatusResponseType = z.infer<typeof agentStatusResponse>;
export type AgentVersionResponseType = z.infer<typeof agentVersionResponse>;
export type ContainerListResponse = z.infer<typeof containerListResponse>;
export type WorkerListResponse = z.infer<typeof workerListResponse>;
export type AuditLogEntry = z.infer<typeof auditLogEntry>;
export type AuditLogListResponse = z.infer<typeof auditLogListResponse>;
export type DeployHistoryEntry = z.infer<typeof deployHistoryEntry>;
export type DeployHistoryListResponse = z.infer<typeof deployHistoryListResponse>;
export type AgentHealthResponseType = z.infer<typeof agentHealthResponse>;
export type PaginationMeta = z.infer<typeof paginationMeta>;
