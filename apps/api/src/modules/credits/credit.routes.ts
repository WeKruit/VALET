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
  getCostConfig: async ({ request }) => {
    const { creditService } = request.diScope.cradle;
    const result = creditService.getCostConfig();
    return { status: 200 as const, body: result };
  },
  consume: async ({ request, body }) => {
    const { creditService } = request.diScope.cradle;
    const result = await creditService.consumeCredits(request.userId, body.costType, {
      costAmount: body.costAmount,
      referenceType: body.referenceType,
      referenceId: body.referenceId,
      description: body.description,
      idempotencyKey: body.idempotencyKey,
    });
    if (!result.success) {
      return {
        status: 402 as const,
        body: { error: "INSUFFICIENT_CREDITS", message: result.message ?? "Insufficient credits" },
      };
    }
    return { status: 200 as const, body: result };
  },
  adminGrant: async ({ request, body }) => {
    // Admin-only check
    const { creditService, userService } = request.diScope.cradle;
    let currentUser;
    try {
      currentUser = await userService.getById(request.userId);
    } catch {
      return {
        status: 403 as const,
        body: { error: "FORBIDDEN", message: "Admin access required" },
      };
    }
    if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
      return {
        status: 403 as const,
        body: { error: "FORBIDDEN", message: "Admin access required" },
      };
    }
    const result = await creditService.grantCredits(body.userId, body.amount, body.reason, {
      description: body.description ?? `Admin grant by ${currentUser.email}`,
    });
    return {
      status: 200 as const,
      body: {
        balance: result.balance,
        message: `Granted ${body.amount} credits to user`,
      },
    };
  },
});
