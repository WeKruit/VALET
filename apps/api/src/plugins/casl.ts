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
  });
}

export default fp(caslPlugin, { name: "casl" });
