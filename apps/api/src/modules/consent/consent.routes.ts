import { initServer } from "@ts-rest/fastify";
import { consentContract } from "@valet/contracts";

const s = initServer();

export const consentRouter = s.router(consentContract, {
  list: async ({ request }) => {
    const { consentService } = request.diScope.cradle;
    const records = await consentService.getByUser(request.userId);
    return { status: 200 as const, body: { data: records } };
  },

  create: async ({ body, request }) => {
    const { consentService } = request.diScope.cradle;
    const record = await consentService.recordConsent({
      userId: request.userId,
      type: body.type,
      version: body.version,
      ipAddress: body.ipAddress ?? request.ip,
      userAgent: body.userAgent ?? request.headers["user-agent"] ?? "",
    });
    return { status: 201 as const, body: record };
  },

  check: async ({ query, request }) => {
    const { consentService } = request.diScope.cradle;
    const result = await consentService.checkConsent(
      request.userId,
      query.type,
      query.version,
    );
    return {
      status: 200 as const,
      body: {
        accepted: result.accepted,
        acceptedAt: result.acceptedAt,
      },
    };
  },
});
