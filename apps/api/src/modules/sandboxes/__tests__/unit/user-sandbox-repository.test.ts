import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @valet/db
vi.mock("@valet/db", () => ({
  userSandboxes: {
    id: "id",
    userId: "user_id",
    sandboxId: "sandbox_id",
    assignedAt: "assigned_at",
    assignedBy: "assigned_by",
  },
  sandboxes: {
    id: "id",
    name: "name",
    capacity: "capacity",
    status: "status",
    healthStatus: "health_status",
  },
  users: {
    id: "id",
    name: "name",
    email: "email",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: "eq", args })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  asc: vi.fn((col: unknown) => ({ type: "asc", col })),
  count: vi.fn(() => ({ as: vi.fn().mockReturnValue("count_alias") })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: "sql",
      strings,
      values,
      as: vi.fn().mockReturnValue("sql_alias"),
    }),
    {},
  ),
}));

import { UserSandboxRepository } from "../../user-sandbox.repository.js";

function fakeAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "assign-uuid-1",
    userId: "user-uuid-1",
    sandboxId: "sandbox-uuid-1",
    assignedAt: new Date("2026-01-01"),
    assignedBy: null,
    ...overrides,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeSelectChain(data: unknown[] = []): any {
  const chain: any = {};
  chain.limit = vi.fn().mockResolvedValue(data);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  chain.as = vi.fn().mockReturnValue("subquery");
  chain.from = vi.fn().mockReturnValue(chain);
  // Make chain awaitable for queries without .limit()
  chain.then = (resolve: any, reject?: any) => Promise.resolve(data).then(resolve, reject);
  return chain;
}

function makeInsertChain(data: unknown[] = []): any {
  const chain: any = {};
  chain.returning = vi.fn().mockResolvedValue(data);
  chain.onConflictDoUpdate = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  return chain;
}

function makeDeleteChain(data: unknown[] = []): any {
  const chain: any = {};
  chain.returning = vi.fn().mockResolvedValue(data);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  return chain;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("UserSandboxRepository", () => {
  let repo: UserSandboxRepository;
  let mockSelect: ReturnType<typeof vi.fn>;
  let mockInsert: ReturnType<typeof vi.fn>;
  let mockDelete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSelect = vi.fn();
    mockInsert = vi.fn();
    mockDelete = vi.fn();
    const mockDb = { select: mockSelect, insert: mockInsert, delete: mockDelete };
    repo = new UserSandboxRepository({ db: mockDb as never });
  });

  describe("findByUserId", () => {
    it("returns assignment when found", async () => {
      const assignment = fakeAssignment();
      const chain = makeSelectChain([assignment]);
      mockSelect.mockReturnValue(chain);

      const result = await repo.findByUserId("user-uuid-1");
      expect(result).toEqual(assignment);
    });

    it("returns null when not found", async () => {
      const chain = makeSelectChain([]);
      mockSelect.mockReturnValue(chain);

      const result = await repo.findByUserId("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("findBySandboxId", () => {
    it("returns list of assignments for a sandbox", async () => {
      const assignments = [
        fakeAssignment(),
        fakeAssignment({ id: "assign-uuid-2", userId: "user-uuid-2" }),
      ];
      const chain = makeSelectChain(assignments);
      // findBySandboxId doesn't call .limit(), it awaits the chain directly
      chain.where = vi.fn().mockResolvedValue(assignments);
      mockSelect.mockReturnValue(chain);

      const result = await repo.findBySandboxId("sandbox-uuid-1");
      expect(result).toHaveLength(2);
    });
  });

  describe("assign", () => {
    it("creates a new assignment via upsert", async () => {
      const assignment = fakeAssignment();
      const chain = makeInsertChain([assignment]);
      mockInsert.mockReturnValue(chain);

      const result = await repo.assign("user-uuid-1", "sandbox-uuid-1");
      expect(result).toEqual(assignment);
      expect(chain.onConflictDoUpdate).toHaveBeenCalled();
    });

    it("passes assignedBy when provided", async () => {
      const assignment = fakeAssignment({ assignedBy: "admin-uuid" });
      const chain = makeInsertChain([assignment]);
      mockInsert.mockReturnValue(chain);

      const result = await repo.assign("user-uuid-1", "sandbox-uuid-1", "admin-uuid");
      expect(result.assignedBy).toBe("admin-uuid");
    });
  });

  describe("unassign", () => {
    it("returns true when a row was deleted", async () => {
      const chain = makeDeleteChain([{ id: "assign-uuid-1" }]);
      mockDelete.mockReturnValue(chain);

      const result = await repo.unassign("user-uuid-1");
      expect(result).toBe(true);
    });

    it("returns false when no row found", async () => {
      const chain = makeDeleteChain([]);
      mockDelete.mockReturnValue(chain);

      const result = await repo.unassign("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("unassignBySandboxId", () => {
    it("returns count of deleted rows", async () => {
      const chain = makeDeleteChain([{ id: "assign-uuid-1" }, { id: "assign-uuid-2" }]);
      mockDelete.mockReturnValue(chain);

      const result = await repo.unassignBySandboxId("sandbox-uuid-1");
      expect(result).toBe(2);
    });

    it("returns 0 when no rows match", async () => {
      const chain = makeDeleteChain([]);
      mockDelete.mockReturnValue(chain);

      const result = await repo.unassignBySandboxId("nonexistent");
      expect(result).toBe(0);
    });
  });

  describe("countBySandbox", () => {
    it("returns count of assignments for a sandbox", async () => {
      const chain = makeSelectChain([{ count: 3 }]);
      mockSelect.mockReturnValue(chain);
      chain.where = vi.fn().mockResolvedValue([{ count: 3 }]);

      const result = await repo.countBySandbox("sandbox-uuid-1");
      expect(result).toBe(3);
    });
  });
});
