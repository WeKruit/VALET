import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  createQaEntryRequest,
  updateQaEntryRequest,
  qaEntryResponse,
  qaListResponse,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const qaBankContract = c.router({
  list: {
    method: "GET",
    path: "/api/v1/qa-bank",
    query: z.object({
      category: z.string().optional(),
    }),
    responses: {
      200: qaListResponse,
    },
    summary: "List Q&A bank entries for the current user",
  },
  create: {
    method: "POST",
    path: "/api/v1/qa-bank",
    body: createQaEntryRequest,
    responses: {
      201: qaEntryResponse,
      400: errorResponse,
    },
    summary: "Create a new Q&A bank entry",
  },
  update: {
    method: "PUT",
    path: "/api/v1/qa-bank/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: updateQaEntryRequest,
    responses: {
      200: qaEntryResponse,
      404: errorResponse,
    },
    summary: "Update a Q&A bank entry",
  },
  delete: {
    method: "DELETE",
    path: "/api/v1/qa-bank/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      204: z.void(),
      404: errorResponse,
    },
    summary: "Delete a Q&A bank entry",
  },
  discover: {
    method: "POST",
    path: "/api/v1/qa-bank/discover",
    body: z.object({
      questions: z.array(
        z.object({
          question: z.string(),
          category: z.string(),
        }),
      ),
    }),
    responses: {
      200: qaListResponse,
      400: errorResponse,
    },
    summary: "Auto-discover and add new screening questions",
  },
});
