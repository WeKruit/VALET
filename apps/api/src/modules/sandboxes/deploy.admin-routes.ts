import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminOnly } from "../../common/middleware/admin.js";

export async function deployAdminRoutes(fastify: FastifyInstance) {
  // GET /api/v1/admin/deploys/config
  fastify.get(
    "/api/v1/admin/deploys/config",
    async (request: FastifyRequest, reply: FastifyReply) => {
      await adminOnly(request);
      const { deployService } = request.diScope.cradle;

      const [autoDeployStaging, autoDeployProd] = await Promise.all([
        deployService.getAutoDeployConfig("staging"),
        deployService.getAutoDeployConfig("prod"),
      ]);

      return reply.send({ autoDeployStaging, autoDeployProd });
    },
  );

  // PUT /api/v1/admin/deploys/config
  fastify.put(
    "/api/v1/admin/deploys/config",
    async (request: FastifyRequest, reply: FastifyReply) => {
      await adminOnly(request);
      const { deployService } = request.diScope.cradle;
      const body = request.body as { autoDeployStaging?: boolean; autoDeployProd?: boolean } | null;

      if (body?.autoDeployStaging !== undefined) {
        await deployService.setAutoDeployConfig("staging", body.autoDeployStaging);
      }
      if (body?.autoDeployProd !== undefined) {
        await deployService.setAutoDeployConfig("prod", body.autoDeployProd);
      }

      const [autoDeployStaging, autoDeployProd] = await Promise.all([
        deployService.getAutoDeployConfig("staging"),
        deployService.getAutoDeployConfig("prod"),
      ]);

      return reply.send({ autoDeployStaging, autoDeployProd });
    },
  );
}
