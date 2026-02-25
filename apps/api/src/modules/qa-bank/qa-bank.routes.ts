import { initServer } from "@ts-rest/fastify";
import { qaBankContract } from "@valet/contracts";
import { requireAbility } from "../../common/middleware/authorize.js";

const s = initServer();

export const qaBankRouter = s.router(qaBankContract, {
  list: async ({ query, request }) => {
    await requireAbility("read", "QaBank")(request);
    const { qaBankService } = request.diScope.cradle;
    const entries = await qaBankService.getQuestions(request.userId, query.category);
    return { status: 200 as const, body: { data: entries } };
  },

  create: async ({ body, request }) => {
    await requireAbility("create", "QaBank")(request);
    const { qaBankService } = request.diScope.cradle;
    const entry = await qaBankService.saveAnswer(request.userId, body);
    return { status: 201 as const, body: entry };
  },

  update: async ({ params, body, request }) => {
    await requireAbility("update", "QaBank")(request);
    const { qaBankService } = request.diScope.cradle;
    const entry = await qaBankService.updateAnswer(params.id, request.userId, body);
    return { status: 200 as const, body: entry };
  },

  delete: async ({ params, request }) => {
    await requireAbility("delete", "QaBank")(request);
    const { qaBankService } = request.diScope.cradle;
    await qaBankService.deleteAnswer(params.id, request.userId);
    return { status: 204 as const, body: undefined };
  },

  discover: async ({ body, request }) => {
    await requireAbility("read", "QaBank")(request);
    const { qaBankService } = request.diScope.cradle;
    const entries = await qaBankService.discoverQuestions(request.userId, body.questions);
    return { status: 200 as const, body: { data: entries } };
  },
});
