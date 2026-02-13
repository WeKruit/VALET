import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  resumeUploadResponse,
  resumeResponse,
  resumeListResponse,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const resumeContract = c.router({
  list: {
    method: "GET",
    path: "/api/v1/resumes",
    responses: {
      200: resumeListResponse,
    },
    summary: "List resumes for the current user",
  },
  getById: {
    method: "GET",
    path: "/api/v1/resumes/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: resumeResponse,
      404: errorResponse,
    },
    summary: "Get a resume by ID",
  },
  upload: {
    method: "POST",
    path: "/api/v1/resumes/upload",
    contentType: "multipart/form-data",
    body: z.object({
      file: z.any(),
    }),
    responses: {
      202: resumeUploadResponse,
      400: errorResponse,
    },
    summary: "Upload a resume (PDF or DOCX)",
  },
  delete: {
    method: "DELETE",
    path: "/api/v1/resumes/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      204: z.void(),
      404: errorResponse,
    },
    summary: "Delete a resume",
  },
  setDefault: {
    method: "PUT",
    path: "/api/v1/resumes/:id/default",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: resumeResponse,
      404: errorResponse,
    },
    summary: "Set a resume as the default",
  },
});

/** CRUD-only contract (excludes upload) for ts-rest server router.
 *  Upload is registered as a standalone Fastify route to avoid
 *  ts-rest body-parsing conflicts with @fastify/multipart.
 */
export const resumeCrudContract = c.router({
  list: resumeContract.list,
  getById: resumeContract.getById,
  delete: resumeContract.delete,
  setDefault: resumeContract.setDefault,
});
