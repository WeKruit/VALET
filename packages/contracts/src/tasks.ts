import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  createTaskRequest,
  taskResponse,
  taskListResponse,
  taskListQuery,
  taskStatsResponse,
  taskExportQuery,
  updateExternalStatusRequest,
  resolveBlockerRequest,
  resolveBlockerResponse,
  vncUrlResponse,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

const queueStatsResponse = z.object({
  available: z.boolean(),
  queued: z.number(),
  active: z.number(),
  completed: z.number(),
  failed: z.number(),
  all: z.number(),
});

export const taskContract = c.router({
  queueStats: {
    method: "GET",
    path: "/api/v1/tasks/queue-stats",
    responses: {
      200: queueStatsResponse,
    },
    summary: "Get pg-boss queue statistics",
  },
  stats: {
    method: "GET",
    path: "/api/v1/tasks/stats",
    responses: {
      200: taskStatsResponse,
    },
    summary: "Get task statistics for the current user",
  },
  export: {
    method: "GET",
    path: "/api/v1/tasks/export",
    query: taskExportQuery,
    responses: {
      200: z.string(),
    },
    summary: "Export tasks as CSV",
  },
  list: {
    method: "GET",
    path: "/api/v1/tasks",
    query: taskListQuery,
    responses: {
      200: taskListResponse,
    },
    summary: "List tasks for the current user",
  },
  getById: {
    method: "GET",
    path: "/api/v1/tasks/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: taskResponse,
      404: errorResponse,
    },
    summary: "Get a task by ID",
  },
  create: {
    method: "POST",
    path: "/api/v1/tasks",
    body: createTaskRequest,
    responses: {
      201: taskResponse,
      400: errorResponse,
    },
    summary: "Create a new application task",
  },
  cancel: {
    method: "DELETE",
    path: "/api/v1/tasks/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      204: z.void(),
      404: errorResponse,
    },
    summary: "Cancel a running task",
  },
  approve: {
    method: "POST",
    path: "/api/v1/tasks/:id/approve",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({
      fieldOverrides: z.record(z.string()).optional(),
    }),
    responses: {
      200: taskResponse,
      404: errorResponse,
    },
    summary: "Approve task fields for submission (Copilot review)",
  },
  updateExternalStatus: {
    method: "PATCH",
    path: "/api/v1/tasks/:id/external-status",
    pathParams: z.object({ id: z.string().uuid() }),
    body: updateExternalStatusRequest,
    responses: {
      200: taskResponse,
      404: errorResponse,
    },
    summary: "Update the external tracking status of a task",
  },
  resolveBlocker: {
    method: "POST",
    path: "/api/v1/tasks/:id/resolve-blocker",
    pathParams: z.object({ id: z.string().uuid() }),
    body: resolveBlockerRequest,
    responses: {
      200: resolveBlockerResponse,
      404: errorResponse,
      409: errorResponse,
    },
    summary: "Resolve a HITL blocker on a paused task",
  },
  retry: {
    method: "POST",
    path: "/api/v1/tasks/:id/retry",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: taskResponse,
      404: errorResponse,
      409: errorResponse,
    },
    summary: "Retry a failed GhostHands task",
  },
  getVncUrl: {
    method: "GET",
    path: "/api/v1/tasks/:id/vnc-url",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: vncUrlResponse,
      404: errorResponse,
    },
    summary: "Get the VNC live-view URL for the sandbox running this task",
  },
});
