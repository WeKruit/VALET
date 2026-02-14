import { initServer } from "@ts-rest/fastify";
import { taskContract } from "@valet/contracts";

const s = initServer();

export const taskRouter = s.router(taskContract, {
  stats: async ({ request }) => {
    const { taskService } = request.diScope.cradle;
    const stats = await taskService.stats(request.userId);
    return { status: 200 as const, body: stats };
  },

  export: async ({ request, reply }) => {
    const { taskService } = request.diScope.cradle;
    const csv = await taskService.exportCsv(request.userId);
    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", "attachment; filename=tasks-export.csv");
    return { status: 200 as const, body: csv };
  },

  list: async ({ query, request }) => {
    const { taskService } = request.diScope.cradle;
    const result = await taskService.list(request.userId, query);
    return { status: 200, body: result };
  },

  getById: async ({ params, request }) => {
    const { taskService } = request.diScope.cradle;
    const task = await taskService.getById(params.id, request.userId);
    return { status: 200, body: task };
  },

  create: async ({ body, request }) => {
    const { taskService } = request.diScope.cradle;
    const task = await taskService.create(body, request.userId);
    return { status: 201, body: task };
  },

  cancel: async ({ params, request }) => {
    const { taskService } = request.diScope.cradle;
    await taskService.cancel(params.id, request.userId);
    return { status: 204, body: undefined };
  },

  approve: async ({ params, body, request }) => {
    const { taskService } = request.diScope.cradle;
    const task = await taskService.approve(
      params.id,
      request.userId,
      body.fieldOverrides,
    );
    return { status: 200, body: task };
  },

  updateExternalStatus: async ({ params, body, request }) => {
    const { taskService } = request.diScope.cradle;
    const task = await taskService.updateExternalStatus(
      params.id,
      request.userId,
      body.externalStatus,
    );
    return { status: 200, body: task };
  },
});
