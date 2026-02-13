import { initServer } from "@ts-rest/fastify";
import { taskEventContract } from "@valet/contracts";

const s = initServer();

export const taskEventRouter = s.router(taskEventContract, {
  list: async ({ params, query, request }) => {
    const { taskEventService } = request.diScope.cradle;
    const result = await taskEventService.listByTaskId(params.taskId, query);
    return { status: 200, body: result };
  },
});
