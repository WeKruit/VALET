import { initServer } from "@ts-rest/fastify";
import { gdprContract } from "@valet/contracts";
import { AppError } from "../../common/errors.js";

const s = initServer();

export const gdprRouter = s.router(gdprContract, {
  export: async ({ request }) => {
    const { gdprService } = request.diScope.cradle;
    try {
      const data = await gdprService.exportUserData(request.userId);
      return { status: 200 as const, body: data };
    } catch {
      throw AppError.notFound("User not found");
    }
  },

  deleteAccount: async ({ request }) => {
    const { gdprService } = request.diScope.cradle;
    try {
      const result = await gdprService.initiateAccountDeletion(request.userId);
      return { status: 200 as const, body: result };
    } catch (e) {
      throw AppError.badRequest((e as Error).message);
    }
  },

  cancelDeletion: async ({ request }) => {
    const { gdprService } = request.diScope.cradle;
    try {
      const result = await gdprService.cancelAccountDeletion(request.userId);
      return { status: 200 as const, body: result };
    } catch (e) {
      throw AppError.badRequest((e as Error).message);
    }
  },
});
