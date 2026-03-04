import { initServer } from "@ts-rest/fastify";
import { jobLeadContract } from "@valet/contracts";
import { requireAbility } from "../../common/middleware/authorize.js";

const s = initServer();

export const jobLeadRouter = s.router(jobLeadContract, {
  list: async ({ query, request }) => {
    await requireAbility("read", "JobLead")(request);
    const { jobLeadService } = request.diScope.cradle;
    const result = await jobLeadService.list(request.userId, {
      status: query.status,
      platform: query.platform,
      search: query.search,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
    return { status: 200 as const, body: result };
  },

  getById: async ({ params, request }) => {
    await requireAbility("read", "JobLead")(request);
    const { jobLeadService } = request.diScope.cradle;
    const lead = await jobLeadService.getById(params.id, request.userId);
    return { status: 200 as const, body: lead };
  },

  create: async ({ body, request }) => {
    await requireAbility("create", "JobLead")(request);
    const { jobLeadService } = request.diScope.cradle;
    const lead = await jobLeadService.create(request.userId, body);
    return { status: 201 as const, body: lead };
  },

  importUrl: async ({ body, request }) => {
    await requireAbility("create", "JobLead")(request);
    const { jobLeadService } = request.diScope.cradle;
    const result = await jobLeadService.importUrl(request.userId, body.url);
    return { status: 201 as const, body: result };
  },

  update: async ({ params, body, request }) => {
    await requireAbility("update", "JobLead")(request);
    const { jobLeadService } = request.diScope.cradle;
    const lead = await jobLeadService.update(params.id, request.userId, body);
    return { status: 200 as const, body: lead };
  },

  delete: async ({ params, request }) => {
    await requireAbility("delete", "JobLead")(request);
    const { jobLeadService } = request.diScope.cradle;
    await jobLeadService.delete(params.id, request.userId);
    return { status: 204 as const, body: undefined };
  },

  queueForApplication: async ({ params, body, request }) => {
    await requireAbility("create", "Task")(request);
    const { jobLeadService } = request.diScope.cradle;
    const task = await jobLeadService.queueForApplication(params.id, request.userId, {
      resumeId: body.resumeId,
    });
    return { status: 200 as const, body: task };
  },
});
