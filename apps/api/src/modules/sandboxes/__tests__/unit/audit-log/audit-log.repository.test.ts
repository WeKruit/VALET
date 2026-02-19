import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// Mock @valet/db so sandboxAuditLogs table columns are defined
vi.mock("@valet/db", () => ({
  sandboxAuditLogs: {
    sandboxId: "sandbox_id",
    action: "action",
    createdAt: "created_at",
  },
}));

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: "eq", args })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  count: vi.fn(() => "count_fn"),
  desc: vi.fn((col: unknown) => ({ type: "desc", col })),
}));

import { AuditLogRepository } from "../../../audit-log.repository.js";

interface MockChain {
  from: Mock;
  where: Mock;
  orderBy: Mock;
  limit: Mock;
  offset: Mock;
  values: Mock;
}

function makeChain(): MockChain {
  const chain = {} as MockChain;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockReturnValue(chain);
  return chain;
}

function makeMockDb() {
  const insertChain = makeChain();

  return {
    insert: vi.fn().mockReturnValue(insertChain),
    select: vi.fn(() => makeChain()),
    _insertChain: insertChain,
  };
}

describe("AuditLogRepository", () => {
  let repo: AuditLogRepository;
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    db = makeMockDb();
    repo = new AuditLogRepository({ db: db as never });
  });

  describe("insert()", () => {
    it("should insert an audit log entry", async () => {
      await repo.insert({
        sandboxId: "sandbox-1",
        userId: "user-1",
        action: "start",
        details: { reason: "manual" },
        ipAddress: "10.0.0.1",
        userAgent: "test-agent",
        result: "success",
        durationMs: 500,
      });

      expect(db.insert).toHaveBeenCalledOnce();
      expect(db._insertChain.values).toHaveBeenCalledOnce();
      const insertedValues = db._insertChain.values.mock.calls[0]![0] as Record<string, unknown>;
      expect(insertedValues.sandboxId).toBe("sandbox-1");
      expect(insertedValues.userId).toBe("user-1");
      expect(insertedValues.action).toBe("start");
      expect(insertedValues.details).toEqual({ reason: "manual" });
      expect(insertedValues.ipAddress).toBe("10.0.0.1");
      expect(insertedValues.result).toBe("success");
      expect(insertedValues.durationMs).toBe(500);
    });

    it("should use defaults for optional fields", async () => {
      await repo.insert({
        sandboxId: "sandbox-2",
        action: "stop",
      });

      expect(db._insertChain.values).toHaveBeenCalledOnce();
      const insertedValues = db._insertChain.values.mock.calls[0]![0] as Record<string, unknown>;
      expect(insertedValues.sandboxId).toBe("sandbox-2");
      expect(insertedValues.userId).toBeNull();
      expect(insertedValues.action).toBe("stop");
      expect(insertedValues.details).toEqual({});
      expect(insertedValues.ipAddress).toBeNull();
      expect(insertedValues.userAgent).toBeNull();
      expect(insertedValues.result).toBe("success");
      expect(insertedValues.errorMessage).toBeNull();
      expect(insertedValues.durationMs).toBeNull();
    });
  });

  describe("findBySandbox()", () => {
    it("should query with sandbox_id filter and pagination", async () => {
      const mockData = [
        { id: "log-1", sandboxId: "sandbox-1", action: "start", createdAt: new Date() },
      ];

      db.select
        .mockImplementationOnce(() => {
          const chain = makeChain();
          chain.offset.mockResolvedValueOnce(mockData);
          return chain;
        })
        .mockImplementationOnce(() => {
          const chain = makeChain();
          chain.where.mockResolvedValueOnce([{ count: 1 }]);
          return chain;
        });

      const result = await repo.findBySandbox("sandbox-1", {
        page: 1,
        pageSize: 20,
      });

      expect(db.select).toHaveBeenCalledTimes(2);
      expect(result.data).toEqual(mockData);
      expect(result.total).toBe(1);
    });

    it("should return empty result when no logs found", async () => {
      db.select
        .mockImplementationOnce(() => {
          const chain = makeChain();
          chain.offset.mockResolvedValueOnce([]);
          return chain;
        })
        .mockImplementationOnce(() => {
          const chain = makeChain();
          chain.where.mockResolvedValueOnce([{ count: 0 }]);
          return chain;
        });

      const result = await repo.findBySandbox("sandbox-99", {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("should apply action filter when provided", async () => {
      db.select
        .mockImplementationOnce(() => {
          const chain = makeChain();
          chain.offset.mockResolvedValueOnce([]);
          return chain;
        })
        .mockImplementationOnce(() => {
          const chain = makeChain();
          chain.where.mockResolvedValueOnce([{ count: 0 }]);
          return chain;
        });

      await repo.findBySandbox("sandbox-1", {
        page: 1,
        pageSize: 10,
        action: "deploy",
      });

      expect(db.select).toHaveBeenCalledTimes(2);
    });

    it("should handle pagination offset correctly", async () => {
      const dataChain = makeChain();
      dataChain.offset.mockResolvedValueOnce([]);

      db.select
        .mockImplementationOnce(() => dataChain)
        .mockImplementationOnce(() => {
          const chain = makeChain();
          chain.where.mockResolvedValueOnce([{ count: 0 }]);
          return chain;
        });

      await repo.findBySandbox("sandbox-1", {
        page: 3,
        pageSize: 10,
      });

      expect(dataChain.limit).toHaveBeenCalledWith(10);
      expect(dataChain.offset).toHaveBeenCalledWith(20);
    });
  });
});
