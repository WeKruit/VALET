import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  sandboxCreateSchema,
  sandboxUpdateSchema,
  sandboxResponse,
  sandboxListResponse,
  sandboxListQuery,
  sandboxMetricsResponse,
  sandboxHealthCheckResponse,
  ec2StatusResponse,
  adminTriggerTaskRequest,
  adminTriggerTaskResponse,
  adminTriggerTestRequest,
  adminTriggerTestResponse,
  workerStatusResponse,
  deployListResponse,
  triggerDeployResponse,
  deployStatusResponse,
  errorResponse,
  agentStatusResponse,
  agentVersionResponse,
  containerListResponse,
  workerListResponse,
  auditLogListResponse,
  deployHistoryListResponse,
  deepHealthCheckResponse,
  atmDeployHistoryResponse,
  atmDeployRecordResponse,
  atmRollbackResponse,
  atmKamalStatusResponse,
  atmKamalAuditResponse,
  atmKamalDeployResponse,
  atmSecretsStatusResponse,
  atmEnabledResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const sandboxContract = c.router({
  list: {
    method: "GET",
    path: "/api/v1/admin/sandboxes",
    query: sandboxListQuery,
    responses: {
      200: sandboxListResponse,
    },
    summary: "List all sandboxes with pagination and filtering",
  },
  getById: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: sandboxResponse,
      404: errorResponse,
    },
    summary: "Get sandbox details by ID",
  },
  create: {
    method: "POST",
    path: "/api/v1/admin/sandboxes",
    body: sandboxCreateSchema,
    responses: {
      201: sandboxResponse,
      400: errorResponse,
      409: errorResponse,
    },
    summary: "Register a new sandbox",
  },
  update: {
    method: "PATCH",
    path: "/api/v1/admin/sandboxes/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: sandboxUpdateSchema,
    responses: {
      200: sandboxResponse,
      404: errorResponse,
    },
    summary: "Update sandbox configuration",
  },
  delete: {
    method: "DELETE",
    path: "/api/v1/admin/sandboxes/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      204: z.void(),
      404: errorResponse,
    },
    summary: "Terminate a sandbox (soft delete)",
  },
  healthCheck: {
    method: "POST",
    path: "/api/v1/admin/sandboxes/:id/health-check",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: sandboxHealthCheckResponse,
      404: errorResponse,
    },
    summary: "Trigger manual health check on a sandbox",
  },
  deepHealthCheck: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/deep-health",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: deepHealthCheckResponse,
      404: errorResponse,
    },
    summary: "Deep health check probing all required services (GH API, Worker, Deploy Server, VNC)",
  },
  metrics: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/metrics",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: sandboxMetricsResponse,
      404: errorResponse,
    },
    summary: "Get real-time metrics from a sandbox",
  },
  restart: {
    method: "POST",
    path: "/api/v1/admin/sandboxes/:id/restart",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: z.object({ message: z.string() }),
      404: errorResponse,
    },
    summary: "Restart AdsPower service on the sandbox",
  },

  // ─── EC2 Controls ───

  startSandbox: {
    method: "POST",
    path: "/api/v1/admin/sandboxes/:id/start",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: z.object({ message: z.string(), ec2Status: z.string() }),
      404: errorResponse,
      409: errorResponse,
    },
    summary: "Start the EC2 instance for this sandbox",
  },
  stopSandbox: {
    method: "POST",
    path: "/api/v1/admin/sandboxes/:id/stop",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: z.object({ message: z.string(), ec2Status: z.string() }),
      404: errorResponse,
      409: errorResponse,
    },
    summary: "Stop the EC2 instance for this sandbox",
  },
  getEc2Status: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/ec2-status",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: ec2StatusResponse,
      404: errorResponse,
    },
    summary: "Get real-time EC2 instance status from AWS",
  },

  // ─── Task Trigger ───

  triggerTask: {
    method: "POST",
    path: "/api/v1/admin/sandboxes/:id/trigger-task",
    pathParams: z.object({ id: z.string().uuid() }),
    body: adminTriggerTaskRequest,
    responses: {
      201: adminTriggerTaskResponse,
      400: errorResponse,
      404: errorResponse,
      409: errorResponse,
    },
    summary: "Trigger a GhostHands job application targeting this sandbox",
  },
  triggerTest: {
    method: "POST",
    path: "/api/v1/admin/sandboxes/:id/trigger-test",
    pathParams: z.object({ id: z.string().uuid() }),
    body: adminTriggerTestRequest,
    responses: {
      201: adminTriggerTestResponse,
      404: errorResponse,
      409: errorResponse,
    },
    summary: "Trigger a quick integration test (Google search) on this sandbox",
  },
  workerStatus: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/worker-status",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: workerStatusResponse,
      404: errorResponse,
    },
    summary: "Get GhostHands worker, task, and API status for this sandbox",
  },

  // ─── Agent Operations ───

  getAgentStatus: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/agent-status",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: agentStatusResponse,
      404: errorResponse,
      502: errorResponse,
    },
    summary: "Get full agent status including containers and workers",
  },
  getAgentVersion: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/agent-version",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: agentVersionResponse,
      404: errorResponse,
      502: errorResponse,
    },
    summary: "Get agent and GhostHands version info",
  },
  listContainers: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/containers",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: containerListResponse,
      404: errorResponse,
      502: errorResponse,
    },
    summary: "List Docker containers on the sandbox agent",
  },
  listWorkers: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/workers",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: workerListResponse,
      404: errorResponse,
      502: errorResponse,
    },
    summary: "List GhostHands workers on the sandbox agent",
  },

  // ─── Audit & History ───

  getAuditLog: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/audit-log",
    pathParams: z.object({ id: z.string().uuid() }),
    query: z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      action: z.string().optional(),
    }),
    responses: {
      200: auditLogListResponse,
      404: errorResponse,
    },
    summary: "Get audit log entries for a sandbox",
  },
  getDeployHistory: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/deploy-history",
    pathParams: z.object({ id: z.string().uuid() }),
    query: z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
    responses: {
      200: deployHistoryListResponse,
      404: errorResponse,
    },
    summary: "Get deploy history for a sandbox",
  },

  // ─── Deploy Management ───

  listDeploys: {
    method: "GET",
    path: "/api/v1/admin/deploys",
    responses: {
      200: deployListResponse,
    },
    summary: "List pending and recent GhostHands deploy notifications",
  },
  triggerDeploy: {
    method: "POST",
    path: "/api/v1/admin/deploys/:id/trigger",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: triggerDeployResponse,
      404: errorResponse,
      409: errorResponse,
    },
    summary: "Trigger rolling GhostHands deploy across all running sandboxes",
  },
  getDeployStatus: {
    method: "GET",
    path: "/api/v1/admin/deploys/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: deployStatusResponse,
      404: errorResponse,
    },
    summary: "Get deploy status with per-sandbox progress",
  },
  cancelDeploy: {
    method: "POST",
    path: "/api/v1/admin/deploys/:id/cancel",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: z.object({ message: z.string() }),
      404: errorResponse,
    },
    summary: "Cancel an in-progress deploy",
  },

  // ─── ATM Operations (backward-compatible: 404-safe on legacy deploy-server) ───

  atmDeployHistory: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/atm/deploys",
    pathParams: z.object({ id: z.string().uuid() }),
    query: z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }),
    responses: {
      200: atmDeployHistoryResponse,
      404: errorResponse,
      502: errorResponse,
    },
    summary: "Get ATM deploy history for a sandbox (empty array if legacy deploy-server)",
  },
  atmDeployRecord: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/atm/deploys/:deployId",
    pathParams: z.object({ id: z.string().uuid(), deployId: z.string() }),
    responses: {
      200: atmDeployRecordResponse.nullable(),
      404: errorResponse,
      502: errorResponse,
    },
    summary: "Get a single ATM deploy record (null if legacy deploy-server)",
  },
  atmRollback: {
    method: "POST",
    path: "/api/v1/admin/sandboxes/:id/atm/rollback",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: atmRollbackResponse,
      404: errorResponse,
      502: errorResponse,
    },
    summary: "Trigger ATM rollback to previous image",
  },
  atmKamalStatus: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/atm/kamal-status",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: atmKamalStatusResponse,
      404: errorResponse,
      502: errorResponse,
    },
    summary: "Get Kamal deploy status (null if not available)",
  },
  atmKamalAudit: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/atm/kamal-audit",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: atmKamalAuditResponse,
      404: errorResponse,
      502: errorResponse,
    },
    summary: "Get Kamal audit log entries (empty array if not available)",
  },
  atmDeployKamal: {
    method: "POST",
    path: "/api/v1/admin/sandboxes/:id/atm/deploy-kamal",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({
      destination: z.string().optional(),
      version: z.string().optional(),
    }),
    responses: {
      200: atmKamalDeployResponse,
      404: errorResponse,
      502: errorResponse,
    },
    summary: "Trigger Kamal deploy on the sandbox",
  },
  atmRollbackKamal: {
    method: "POST",
    path: "/api/v1/admin/sandboxes/:id/atm/rollback-kamal",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({
      destination: z.string().optional(),
      version: z.string(),
    }),
    responses: {
      200: atmKamalDeployResponse,
      404: errorResponse,
      502: errorResponse,
    },
    summary: "Trigger Kamal rollback on the sandbox",
  },
  atmSecretsStatus: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/atm/secrets-status",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: atmSecretsStatusResponse,
      404: errorResponse,
      502: errorResponse,
    },
    summary: "Get Infisical secrets connection status (null if not available)",
  },
  atmEnabled: {
    method: "GET",
    path: "/api/v1/admin/sandboxes/:id/atm/enabled",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: atmEnabledResponse,
      404: errorResponse,
    },
    summary: "Check if sandbox is running ATM (vs legacy deploy-server)",
  },
});
