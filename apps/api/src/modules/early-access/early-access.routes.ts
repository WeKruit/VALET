import { initServer } from "@ts-rest/fastify";
import { earlyAccessContract } from "@valet/contracts";

const s = initServer();

export const earlyAccessRouter = s.router(earlyAccessContract, {
  submit: async ({ body, request }) => {
    const { earlyAccessService } = request.diScope.cradle;
    const result = await earlyAccessService.submit(body);
    return { status: 201 as const, body: result };
  },
});
