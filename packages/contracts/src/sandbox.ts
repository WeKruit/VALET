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
  errorResponse,
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
});
