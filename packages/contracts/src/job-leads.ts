import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  jobLeadResponse,
  jobLeadListResponse,
  jobLeadListQuery,
  createJobLeadBody,
  updateJobLeadBody,
  importJobUrlBody,
  importJobUrlResponse,
  queueForApplicationBody,
  errorResponse,
} from "@valet/shared/schemas";
import { taskResponse } from "@valet/shared/schemas";

const c = initContract();

export const jobLeadContract = c.router({
  list: {
    method: "GET",
    path: "/api/v1/job-leads",
    query: jobLeadListQuery,
    responses: {
      200: jobLeadListResponse,
    },
    summary: "List job leads for the current user",
  },

  getById: {
    method: "GET",
    path: "/api/v1/job-leads/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: jobLeadResponse,
      404: errorResponse,
    },
    summary: "Get a job lead by ID",
  },

  create: {
    method: "POST",
    path: "/api/v1/job-leads",
    body: createJobLeadBody,
    responses: {
      201: jobLeadResponse,
      400: errorResponse,
    },
    summary: "Create a new job lead manually",
  },

  importUrl: {
    method: "POST",
    path: "/api/v1/job-leads/import-url",
    body: importJobUrlBody,
    responses: {
      201: importJobUrlResponse,
      400: errorResponse,
    },
    summary: "Import a job lead from a URL",
  },

  update: {
    method: "PATCH",
    path: "/api/v1/job-leads/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: updateJobLeadBody,
    responses: {
      200: jobLeadResponse,
      404: errorResponse,
    },
    summary: "Update a job lead",
  },

  delete: {
    method: "DELETE",
    path: "/api/v1/job-leads/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      204: z.void(),
      404: errorResponse,
    },
    summary: "Delete a job lead",
  },

  queueForApplication: {
    method: "POST",
    path: "/api/v1/job-leads/:id/queue",
    pathParams: z.object({ id: z.string().uuid() }),
    body: queueForApplicationBody,
    responses: {
      200: taskResponse,
      400: errorResponse,
      404: errorResponse,
    },
    summary: "Queue a job lead for application, creating a task",
  },
});
