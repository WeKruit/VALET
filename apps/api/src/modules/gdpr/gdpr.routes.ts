import type { FastifyInstance } from "fastify";

/**
 * GDPR routes for data export and account deletion.
 *
 * Implements:
 *   - GDPR Article 20: Right to data portability (GET /export)
 *   - GDPR Article 17: Right to erasure (DELETE /delete-account)
 *   - Grace period cancellation (POST /cancel-deletion)
 *
 * All routes require authentication (userId from JWT).
 */
export default async function gdprRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/gdpr/export
   *
   * Export all user data as a JSON file (GDPR Article 20 — data portability).
   */
  fastify.get(
    "/api/v1/gdpr/export",
    {
      schema: {
        tags: ["GDPR"],
        description: "Export all user data as JSON (GDPR Article 20)",
      },
    },
    async (request, reply) => {
      const userId = (request as any).userId;
      const { gdprService } = (request as any).diScope.cradle;

      const exportData = await gdprService.exportUserData(userId);

      reply.header("Content-Type", "application/json; charset=utf-8");
      reply.header(
        "Content-Disposition",
        `attachment; filename="wekruit-data-export-${new Date().toISOString().split("T")[0]}.json"`,
      );

      return exportData;
    },
  );

  /**
   * DELETE /api/v1/gdpr/delete-account
   *
   * Initiate account deletion with a 30-day grace period (GDPR Article 17).
   */
  fastify.delete(
    "/api/v1/gdpr/delete-account",
    {
      schema: {
        tags: ["GDPR"],
        description:
          "Initiate account deletion with 30-day grace period (GDPR Article 17)",
      },
    },
    async (request, _reply) => {
      const userId = (request as any).userId;
      const { gdprService } = (request as any).diScope.cradle;

      const result = await gdprService.initiateAccountDeletion(userId);

      return result;
    },
  );

  /**
   * POST /api/v1/gdpr/cancel-deletion
   *
   * Cancel a pending account deletion during the 30-day grace period.
   */
  fastify.post(
    "/api/v1/gdpr/cancel-deletion",
    {
      schema: {
        tags: ["GDPR"],
        description: "Cancel pending account deletion during grace period",
      },
    },
    async (request, _reply) => {
      const userId = (request as any).userId;
      const { gdprService } = (request as any).diScope.cradle;

      const result = await gdprService.cancelAccountDeletion(userId);

      return result;
    },
  );
}
