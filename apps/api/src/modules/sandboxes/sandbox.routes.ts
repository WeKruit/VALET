import { initServer } from "@ts-rest/fastify";
import { sandboxContract } from "@valet/contracts";
import { adminOnly } from "../../common/middleware/admin.js";

const s = initServer();

export const sandboxRouter = s.router(sandboxContract, {
  list: async ({ query, request, reply }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.list(query);
    return { status: 200, body: result };
  },

  getById: async ({ params, request, reply }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const sandbox = await sandboxService.getById(params.id);
    return { status: 200, body: sandbox };
  },

  create: async ({ body, request, reply }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const sandbox = await sandboxService.create(body);
    return { status: 201, body: sandbox };
  },

  update: async ({ params, body, request, reply }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const sandbox = await sandboxService.update(params.id, body);
    return { status: 200, body: sandbox };
  },

  delete: async ({ params, request, reply }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    await sandboxService.terminate(params.id);
    return { status: 204, body: undefined };
  },

  healthCheck: async ({ params, request, reply }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.healthCheck(params.id);
    return { status: 200, body: result };
  },

  metrics: async ({ params, request, reply }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.getMetrics(params.id);
    return { status: 200, body: result };
  },

  restart: async ({ params, request, reply }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.restartAdspower(params.id);
    return { status: 200, body: result };
  },

  // ─── EC2 Controls ───

  startSandbox: async ({ params, request, reply }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.startSandbox(params.id);
    return { status: 200, body: result };
  },

  stopSandbox: async ({ params, request, reply }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.stopSandbox(params.id);
    return { status: 200, body: result };
  },

  getEc2Status: async ({ params, request, reply }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.getEc2Status(params.id);
    return { status: 200, body: result };
  },
});
