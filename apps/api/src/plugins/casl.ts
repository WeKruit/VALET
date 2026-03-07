import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { defineAbilitiesFor, type AppAbility } from "@valet/shared/auth";

declare module "fastify" {
  interface FastifyRequest {
    ability: AppAbility | null;
  }
}

async function caslPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest("ability", null);

  fastify.addHook("onRequest", async (request) => {
    if (request.userRole) {
      request.ability = defineAbilitiesFor(request.userRole);
    }
    // Temporary diagnostic — remove after 403 investigation
    const path = request.url?.split("?")[0] ?? "";
    if (path.startsWith("/api/v1/") && !path.includes("/health")) {
      request.log.info(
        { userRole: request.userRole ?? "NOT_SET", hasAbility: !!request.ability, path },
        "casl:onRequest",
      );
    }
  });
}

export default fp(caslPlugin, { name: "casl" });
