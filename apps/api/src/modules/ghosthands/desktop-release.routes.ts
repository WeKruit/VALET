import { initServer } from "@ts-rest/fastify";
import { desktopReleaseContract } from "@valet/contracts";

const s = initServer();

export const desktopReleaseRouter = s.router(desktopReleaseContract, {
  latest: async ({ request }) => {
    const { redis } = request.diScope.cradle;
    const raw = await redis.get("desktop:latest-release");

    if (!raw) {
      return {
        status: 404 as const,
        body: { error: "No desktop release published yet" },
      };
    }

    const data = JSON.parse(raw) as {
      version: string;
      dmgArm64Url?: string;
      dmgX64Url?: string | null;
      dmgUrl?: string; // legacy field
      releaseUrl: string;
      releasedAt: string;
    };

    return {
      status: 200 as const,
      body: {
        version: data.version,
        dmgArm64Url: data.dmgArm64Url ?? data.dmgUrl ?? "",
        dmgX64Url: data.dmgX64Url ?? null,
        releaseUrl: data.releaseUrl,
        releasedAt: data.releasedAt,
      },
    };
  },
});
