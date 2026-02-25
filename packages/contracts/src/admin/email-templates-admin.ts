import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { errorResponse } from "@valet/shared/schemas";

const c = initContract();

// ─── Shared Schemas ───

const templateVariable = z.object({
  name: z.string(),
  required: z.boolean(),
});

const emailTemplateItem = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  subject: z.string(),
  mjmlBody: z.string(),
  textBody: z.string().nullable(),
  variables: z.array(templateVariable).nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const emailTemplateListResponse = z.object({
  items: z.array(emailTemplateItem),
});

const createEmailTemplateBody = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-z0-9_-]+$/,
      "Template name must be lowercase alphanumeric with underscores or hyphens",
    ),
  description: z.string().optional(),
  subject: z.string().min(1).max(255),
  mjmlBody: z.string().min(1),
  textBody: z.string().optional(),
  variables: z.array(templateVariable).optional(),
  isActive: z.boolean().optional().default(true),
});

const updateEmailTemplateBody = z.object({
  description: z.string().optional(),
  subject: z.string().min(1).max(255).optional(),
  mjmlBody: z.string().min(1).optional(),
  textBody: z.string().nullable().optional(),
  variables: z.array(templateVariable).optional(),
  isActive: z.boolean().optional(),
});

const previewBody = z.object({
  variables: z.record(z.string(), z.union([z.string(), z.number()])),
});

const previewResponse = z.object({
  subject: z.string(),
  html: z.string(),
  text: z.string().nullable(),
});

const sendTestBody = z.object({
  to: z.string().email(),
  variables: z.record(z.string(), z.union([z.string(), z.number()])),
});

const actionResponse = z.object({
  message: z.string(),
});

// ─── Contract ───

export const emailTemplatesAdminContract = c.router({
  list: {
    method: "GET",
    path: "/api/v1/admin/email-templates",
    query: z.object({
      isActive: z.coerce.boolean().optional(),
    }),
    responses: {
      200: emailTemplateListResponse,
      403: errorResponse,
    },
    summary: "List email templates (admin)",
  },
  get: {
    method: "GET",
    path: "/api/v1/admin/email-templates/:name",
    pathParams: z.object({
      name: z
        .string()
        .min(1)
        .max(100)
        .regex(
          /^[a-z0-9_-]+$/,
          "Template name must be lowercase alphanumeric with underscores or hyphens",
        ),
    }),
    responses: {
      200: emailTemplateItem,
      403: errorResponse,
      404: errorResponse,
    },
    summary: "Get email template by name (admin)",
  },
  create: {
    method: "POST",
    path: "/api/v1/admin/email-templates",
    body: createEmailTemplateBody,
    responses: {
      201: emailTemplateItem,
      400: errorResponse,
      403: errorResponse,
      409: errorResponse,
    },
    summary: "Create email template (admin)",
  },
  update: {
    method: "PATCH",
    path: "/api/v1/admin/email-templates/:name",
    pathParams: z.object({
      name: z
        .string()
        .min(1)
        .max(100)
        .regex(
          /^[a-z0-9_-]+$/,
          "Template name must be lowercase alphanumeric with underscores or hyphens",
        ),
    }),
    body: updateEmailTemplateBody,
    responses: {
      200: emailTemplateItem,
      403: errorResponse,
      404: errorResponse,
    },
    summary: "Update email template (admin)",
  },
  remove: {
    method: "DELETE",
    path: "/api/v1/admin/email-templates/:name",
    pathParams: z.object({
      name: z
        .string()
        .min(1)
        .max(100)
        .regex(
          /^[a-z0-9_-]+$/,
          "Template name must be lowercase alphanumeric with underscores or hyphens",
        ),
    }),
    body: z.object({}),
    responses: {
      200: actionResponse,
      403: errorResponse,
      404: errorResponse,
    },
    summary: "Delete email template (admin)",
  },
  preview: {
    method: "POST",
    path: "/api/v1/admin/email-templates/:name/preview",
    pathParams: z.object({
      name: z
        .string()
        .min(1)
        .max(100)
        .regex(
          /^[a-z0-9_-]+$/,
          "Template name must be lowercase alphanumeric with underscores or hyphens",
        ),
    }),
    body: previewBody,
    responses: {
      200: previewResponse,
      403: errorResponse,
      404: errorResponse,
    },
    summary: "Preview rendered email template (admin)",
  },
  sendTest: {
    method: "POST",
    path: "/api/v1/admin/email-templates/:name/send-test",
    pathParams: z.object({
      name: z
        .string()
        .min(1)
        .max(100)
        .regex(
          /^[a-z0-9_-]+$/,
          "Template name must be lowercase alphanumeric with underscores or hyphens",
        ),
    }),
    body: sendTestBody,
    responses: {
      200: actionResponse,
      403: errorResponse,
      404: errorResponse,
    },
    summary: "Send test email from template (admin)",
  },
});
