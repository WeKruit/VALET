import { describe, it, expect, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import { resolveCurrentRole } from "./auth.js";

function makeMockRequest(overrides: {
  redisGet?: () => Promise<string | null>;
  redisSet?: () => Promise<unknown>;
  dbSelect?: () => { from: () => { where: () => { limit: () => Promise<{ role: string }[]> } } };
}): FastifyRequest {
  const {
    redisGet = vi.fn().mockResolvedValue(null),
    redisSet = vi.fn().mockResolvedValue("OK"),
    dbSelect,
  } = overrides;

  const defaultDbSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ role: "admin" }]),
      }),
    }),
  });

  return {
    server: {
      redis: {
        get: redisGet,
        set: redisSet,
      },
      db: {
        select: dbSelect ?? defaultDbSelect,
      },
    },
  } as unknown as FastifyRequest;
}

function makeDbSelect(rows: { role: string }[]) {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

describe("resolveCurrentRole", () => {
  const userId = "user-123";
  const jwtRole = "user";

  it("returns cached role when redis.get() succeeds", async () => {
    const request = makeMockRequest({
      redisGet: vi.fn().mockResolvedValue("admin"),
    });

    const role = await resolveCurrentRole(request, userId, jwtRole);
    expect(role).toBe("admin");
    // DB should NOT have been called
    expect(request.server.db.select).not.toHaveBeenCalled();
  });

  it("returns DB role when redis.get() throws", async () => {
    const dbSelect = makeDbSelect([{ role: "admin" }]);
    const request = makeMockRequest({
      redisGet: vi.fn().mockRejectedValue(new Error("Redis connection lost")),
      dbSelect,
    });

    const role = await resolveCurrentRole(request, userId, jwtRole);
    expect(role).toBe("admin");
    expect(dbSelect).toHaveBeenCalled();
  });

  it("returns DB role when redis.set() throws", async () => {
    const dbSelect = makeDbSelect([{ role: "moderator" }]);
    const request = makeMockRequest({
      redisGet: vi.fn().mockResolvedValue(null),
      redisSet: vi.fn().mockRejectedValue(new Error("Redis write failed")),
      dbSelect,
    });

    const role = await resolveCurrentRole(request, userId, jwtRole);
    expect(role).toBe("moderator");
  });

  it("falls back to jwtRole only when DB query throws", async () => {
    const dbSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error("DB connection refused")),
        }),
      }),
    });

    const request = makeMockRequest({
      redisGet: vi.fn().mockResolvedValue(null),
      dbSelect,
    });

    const role = await resolveCurrentRole(request, userId, jwtRole);
    expect(role).toBe("user");
  });

  it("falls back to jwtRole when both redis and DB fail", async () => {
    const dbSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error("DB down")),
        }),
      }),
    });

    const request = makeMockRequest({
      redisGet: vi.fn().mockRejectedValue(new Error("Redis down")),
      dbSelect,
    });

    const role = await resolveCurrentRole(request, userId, jwtRole);
    expect(role).toBe("user");
  });

  it("returns jwtRole when DB returns no rows", async () => {
    const dbSelect = makeDbSelect([]);
    const request = makeMockRequest({
      redisGet: vi.fn().mockResolvedValue(null),
      dbSelect,
    });

    const role = await resolveCurrentRole(request, userId, jwtRole);
    expect(role).toBe("user");
  });
});
