import { initServer } from "@ts-rest/fastify";
import { emailTemplatesAdminContract } from "@valet/contracts";
import { adminOnly } from "../../common/middleware/admin.js";
import { AppError } from "../../common/errors.js";
import { sendEmail } from "../../helpers/mailgun.js";

const s = initServer();

function serializeTemplate(t: {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  mjmlBody: string;
  textBody: string | null;
  variables: Array<{ name: string; required: boolean }> | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    subject: t.subject,
    mjmlBody: t.mjmlBody,
    textBody: t.textBody,
    variables: t.variables,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export const emailTemplatesAdminRouter = s.router(emailTemplatesAdminContract, {
  list: async ({ query, request }) => {
    await adminOnly(request);
    const { emailTemplatesRepo } = request.diScope.cradle;
    const filter = query.isActive !== undefined ? { isActive: query.isActive } : undefined;
    const templates = await emailTemplatesRepo.list(filter);
    return {
      status: 200 as const,
      body: { items: templates.map(serializeTemplate) },
    };
  },

  get: async ({ params, request }) => {
    await adminOnly(request);
    const { emailTemplatesRepo } = request.diScope.cradle;
    const template = await emailTemplatesRepo.getByName(params.name);
    if (!template) {
      throw AppError.notFound(`Email template "${params.name}" not found`);
    }
    return { status: 200 as const, body: serializeTemplate(template) };
  },

  create: async ({ body, request }) => {
    await adminOnly(request);
    const { emailTemplatesRepo } = request.diScope.cradle;

    // Check for duplicate name
    const existing = await emailTemplatesRepo.getByName(body.name);
    if (existing) {
      throw AppError.conflict(`Email template "${body.name}" already exists`);
    }

    const template = await emailTemplatesRepo.create({
      name: body.name,
      description: body.description,
      subject: body.subject,
      mjmlBody: body.mjmlBody,
      textBody: body.textBody,
      variables: body.variables,
      isActive: body.isActive,
    });
    return { status: 201 as const, body: serializeTemplate(template) };
  },

  update: async ({ params, body, request }) => {
    await adminOnly(request);
    const { emailTemplatesRepo } = request.diScope.cradle;
    const template = await emailTemplatesRepo.update(params.name, body);
    if (!template) {
      throw AppError.notFound(`Email template "${params.name}" not found`);
    }
    return { status: 200 as const, body: serializeTemplate(template) };
  },

  remove: async ({ params, request }) => {
    await adminOnly(request);
    const { emailTemplatesRepo } = request.diScope.cradle;
    const template = await emailTemplatesRepo.deleteByName(params.name);
    if (!template) {
      throw AppError.notFound(`Email template "${params.name}" not found`);
    }
    return {
      status: 200 as const,
      body: { message: `Email template "${params.name}" deleted` },
    };
  },

  preview: async ({ params, body, request }) => {
    await adminOnly(request);
    const { emailTemplateService } = request.diScope.cradle;
    const rendered = await emailTemplateService.render(params.name, body.variables);
    return {
      status: 200 as const,
      body: {
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      },
    };
  },

  sendTest: async ({ params, body, request }) => {
    await adminOnly(request);

    // Rate-limit test email sends: max 10 per hour per admin user
    const redis = request.server.redis;
    const rlKey = `rl:admin-send-test:${request.userId}`;
    const count = await redis.incr(rlKey);
    if (count === 1) await redis.expire(rlKey, 3600);
    if (count > 10) {
      throw AppError.tooManyRequests("Test email rate limit reached. Maximum 10 per hour.");
    }

    const { emailTemplateService } = request.diScope.cradle;
    const rendered = await emailTemplateService.render(params.name, body.variables);

    await sendEmail(body.to, {
      subject: `[TEST] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text ?? undefined,
    });

    return {
      status: 200 as const,
      body: { message: `Test email sent to ${body.to}` },
    };
  },
});
