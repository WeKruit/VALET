import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { errorResponse } from "@valet/shared/schemas";

const c = initContract();

// ─── Response Schemas ───

const earlyAccessSubmissionItem = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  source: z.string(),
  referralCode: z.string().nullable(),
  emailStatus: z.string(),
  emailSentAt: z.string().nullable(),
  createdAt: z.string(),
});

const earlyAccessListResponse = z.object({
  items: z.array(earlyAccessSubmissionItem),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});

const earlyAccessStatsResponse = z.object({
  total: z.number().int(),
  byStatus: z.record(z.string(), z.number().int()),
});

const earlyAccessActionResponse = z.object({
  message: z.string(),
});

// ─── Contract ───

export const earlyAccessAdminContract = c.router({
  list: {
    method: "GET",
    path: "/api/v1/admin/early-access",
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      emailStatus: z.enum(["pending", "sent", "promoted", "failed"]).optional(),
      search: z.string().max(200).optional(),
    }),
    responses: {
      200: earlyAccessListResponse,
      403: errorResponse,
    },
    summary: "List early access submissions (admin)",
  },
  stats: {
    method: "GET",
    path: "/api/v1/admin/early-access/stats",
    responses: {
      200: earlyAccessStatsResponse,
      403: errorResponse,
    },
    summary: "Get early access submission stats (admin)",
  },
  promote: {
    method: "POST",
    path: "/api/v1/admin/early-access/:id/promote",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: earlyAccessActionResponse,
      403: errorResponse,
      404: errorResponse,
    },
    summary: "Promote early access user to beta (admin)",
  },
  resend: {
    method: "POST",
    path: "/api/v1/admin/early-access/:id/resend",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: earlyAccessActionResponse,
      403: errorResponse,
      404: errorResponse,
    },
    summary: "Resend confirmation email to early access user (admin)",
  },
  remove: {
    method: "DELETE",
    path: "/api/v1/admin/early-access/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: earlyAccessActionResponse,
      403: errorResponse,
      404: errorResponse,
    },
    summary: "Remove early access submission (admin)",
  },
});
