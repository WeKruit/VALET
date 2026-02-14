import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance } from "fastify";
import { billingContract } from "@valet/contracts";

const s = initServer();

/**
 * ts-rest router for authenticated billing endpoints (checkout, portal, status).
 */
export const billingRouter = s.router(billingContract, {
  createCheckoutSession: async ({ body, request }) => {
    const { billingService } = request.diScope.cradle;

    const url = await billingService.createCheckoutSession(
      request.userId,
      body.priceId,
      body.successUrl,
      body.cancelUrl,
    );

    return { status: 200, body: { url } };
  },

  createPortalSession: async ({ body, request }) => {
    const { billingService } = request.diScope.cradle;

    const url = await billingService.createPortalSession(
      request.userId,
      body.returnUrl,
    );

    return { status: 200, body: { url } };
  },

  getStatus: async ({ request }) => {
    const { billingService } = request.diScope.cradle;

    const status = await billingService.getBillingStatus(request.userId);
    return { status: 200, body: status };
  },

  createPaypalOrder: async ({ body, request }) => {
    const { billingService } = request.diScope.cradle;

    const orderId = await billingService.createPaypalOrder(
      request.userId,
      body.priceId,
    );

    return { status: 200, body: { orderId } };
  },

  capturePaypalOrder: async ({ body, request }) => {
    const { billingService } = request.diScope.cradle;

    const result = await billingService.capturePaypalOrder(
      request.userId,
      body.orderId,
    );

    return { status: 200, body: result };
  },
});

/**
 * Standalone Fastify route for Stripe webhooks.
 * Registered outside ts-rest because:
 * 1. Needs raw body access for signature verification
 * 2. Must bypass auth middleware (Stripe sends requests without JWT)
 */
export async function billingWebhookRoute(fastify: FastifyInstance) {
  fastify.post(
    "/api/v1/billing/webhook",
    {
      config: { rawBody: true },
    },
    async (request, reply) => {
      const { billingService } = request.diScope.cradle;

      const signature = request.headers["stripe-signature"];
      if (!signature || typeof signature !== "string") {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Missing stripe-signature header",
        });
      }

      // Fastify raw body — the request body is the raw string
      const rawBody =
        typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body);

      try {
        await billingService.handleWebhook(rawBody, signature);
        return reply.status(200).send({ success: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Webhook processing failed";
        return reply.status(400).send({
          error: "Bad Request",
          message,
        });
      }
    },
  );
}
