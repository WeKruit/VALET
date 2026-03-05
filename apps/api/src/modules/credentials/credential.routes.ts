import { initServer } from "@ts-rest/fastify";
import { credentialContract } from "@valet/contracts";
import { requireAbility } from "../../common/middleware/authorize.js";

const s = initServer();

export const credentialRouter = s.router(credentialContract, {
  // ─── Platform Credentials ───

  listPlatformCredentials: async ({ request }) => {
    await requireAbility("read", "Settings")(request);
    const { credentialService } = request.diScope.cradle;
    const data = await credentialService.listPlatformCredentials(request.userId);
    return { status: 200 as const, body: { data } };
  },

  createPlatformCredential: async ({ body, request }) => {
    await requireAbility("create", "Settings")(request);
    const { credentialService } = request.diScope.cradle;
    const credential = await credentialService.createPlatformCredential(request.userId, body);
    return { status: 201 as const, body: credential };
  },

  updatePlatformCredential: async ({ params, body, request }) => {
    await requireAbility("update", "Settings")(request);
    const { credentialService } = request.diScope.cradle;
    const credential = await credentialService.updatePlatformCredential(
      request.userId,
      params.id,
      body,
    );
    return { status: 200 as const, body: credential };
  },

  deletePlatformCredential: async ({ params, request }) => {
    await requireAbility("delete", "Settings")(request);
    const { credentialService } = request.diScope.cradle;
    await credentialService.deletePlatformCredential(request.userId, params.id);
    return { status: 204 as const, body: undefined };
  },

  // ─── Mailbox Credentials ───

  listMailboxCredentials: async ({ request }) => {
    await requireAbility("read", "Settings")(request);
    const { credentialService } = request.diScope.cradle;
    const data = await credentialService.listMailboxCredentials(request.userId);
    return { status: 200 as const, body: { data } };
  },

  createMailboxCredential: async ({ body, request }) => {
    await requireAbility("create", "Settings")(request);
    const { credentialService } = request.diScope.cradle;
    const credential = await credentialService.createMailboxCredential(request.userId, body);
    return { status: 201 as const, body: credential };
  },

  updateMailboxCredential: async ({ params, body, request }) => {
    await requireAbility("update", "Settings")(request);
    const { credentialService } = request.diScope.cradle;
    const credential = await credentialService.updateMailboxCredential(
      request.userId,
      params.id,
      body,
    );
    return { status: 200 as const, body: credential };
  },

  deleteMailboxCredential: async ({ params, request }) => {
    await requireAbility("delete", "Settings")(request);
    const { credentialService } = request.diScope.cradle;
    await credentialService.deleteMailboxCredential(request.userId, params.id);
    return { status: 204 as const, body: undefined };
  },

  // ─── Readiness ───

  checkReadiness: async ({ request }) => {
    await requireAbility("read", "Settings")(request);
    const { credentialService } = request.diScope.cradle;
    const readiness = await credentialService.checkReadiness(request.userId);
    return { status: 200 as const, body: readiness };
  },
});
