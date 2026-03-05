import { initServer } from "@ts-rest/fastify";
import { creditContract } from "@valet/contracts";

const s = initServer();

export const creditRouter = s.router(creditContract, {
  getBalance: async ({ request }) => {
    const { creditService } = request.diScope.cradle;
    const result = await creditService.getBalance(request.userId);
    return { status: 200 as const, body: result };
  },
  getLedger: async ({ request, query }) => {
    const { creditService } = request.diScope.cradle;
    const result = await creditService.getLedger(
      request.userId,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
    return { status: 200 as const, body: result };
  },
});
