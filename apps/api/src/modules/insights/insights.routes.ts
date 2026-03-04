import { initServer } from "@ts-rest/fastify";
import { insightsContract } from "@valet/contracts";
import { requireAbility } from "../../common/middleware/authorize.js";

const s = initServer();

export const insightsRouter = s.router(insightsContract, {
  getVelocity: async ({ query, request }) => {
    await requireAbility("read", "Task")(request);
    const { insightsService } = request.diScope.cradle;
    const result = await insightsService.getVelocity(request.userId, query.period);
    return { status: 200 as const, body: result };
  },

  getConversionByPlatform: async ({ request }) => {
    await requireAbility("read", "Task")(request);
    const { insightsService } = request.diScope.cradle;
    const result = await insightsService.getConversionByPlatform(request.userId);
    return { status: 200 as const, body: result };
  },

  getResponseRates: async ({ request }) => {
    await requireAbility("read", "Task")(request);
    const { insightsService } = request.diScope.cradle;
    const result = await insightsService.getResponseRates(request.userId);
    return { status: 200 as const, body: result };
  },

  getResumePerformance: async ({ request }) => {
    await requireAbility("read", "Resume")(request);
    const { insightsService } = request.diScope.cradle;
    const result = await insightsService.getResumePerformance(request.userId);
    return { status: 200 as const, body: result };
  },
});
