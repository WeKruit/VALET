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

import { eq, and } from "drizzle-orm";
import { UserSandboxRepository } from "../../user-sandbox.repository.js";

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
  chain.then = (resolve: any, reject?: any) => Promise.resolve(data).then(resolve, reject);
  return chain;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("UserSandboxRepository — findBestAvailableSandbox()", () => {
  let repo: UserSandboxRepository;
  let mockSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect = vi.fn();
    const mockDb = {
      select: mockSelect,
      insert: vi.fn(),
      delete: vi.fn(),
    };
    repo = new UserSandboxRepository({ db: mockDb as never });
  });

  it("returns sandbox with zero assignments when one healthy sandbox exists", async () => {
    // Subquery select (assignment counts) returns a chain with .as()
    const subqueryChain = makeSelectChain();
    // Main query returns the sandbox
    const mainChain = makeSelectChain([{ id: "sb-1", capacity: 5, assignmentCount: 0 }]);

    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? subqueryChain : mainChain;
    });

    const result = await repo.findBestAvailableSandbox();
    expect(result).toBe("sb-1");
  });

  it("returns null when no active+healthy sandboxes exist", async () => {
    const subqueryChain = makeSelectChain();
    const mainChain = makeSelectChain([]); // empty result set

    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? subqueryChain : mainChain;
    });

    const result = await repo.findBestAvailableSandbox();
    expect(result).toBeNull();
  });

  it("picks sandbox with lowest load ratio among 3 sandboxes (1/5 < 2/5 < 3/5)", async () => {
    // The SQL ORDER BY picks lowest load ratio, LIMIT 1 — we just get the first row
    const subqueryChain = makeSelectChain();
    const mainChain = makeSelectChain([{ id: "sb-low", capacity: 5, assignmentCount: 1 }]);

    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? subqueryChain : mainChain;
    });

    const result = await repo.findBestAvailableSandbox();
    expect(result).toBe("sb-low");
  });

  it("picks higher-capacity sandbox when assignment counts are equal (2/10 vs 2/5)", async () => {
    // DB returns sorted by load ratio: 2/10=0.2 < 2/5=0.4
    const subqueryChain = makeSelectChain();
    const mainChain = makeSelectChain([{ id: "sb-big", capacity: 10, assignmentCount: 2 }]);

    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? subqueryChain : mainChain;
    });

    const result = await repo.findBestAvailableSandbox();
    expect(result).toBe("sb-big");
  });

  it("returns null when the only sandbox is at capacity (3/3)", async () => {
    const subqueryChain = makeSelectChain();
    const mainChain = makeSelectChain([{ id: "sb-full", capacity: 3, assignmentCount: 3 }]);

    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? subqueryChain : mainChain;
    });

    const result = await repo.findBestAvailableSandbox();
    expect(result).toBeNull();
  });

  it("returns null when all sandboxes are at capacity", async () => {
    // Even though DB returns a row (lowest load ratio), capacity check rejects it
    const subqueryChain = makeSelectChain();
    const mainChain = makeSelectChain([{ id: "sb-full", capacity: 5, assignmentCount: 5 }]);

    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? subqueryChain : mainChain;
    });

    const result = await repo.findBestAvailableSandbox();
    expect(result).toBeNull();
  });

  it("verifies WHERE filters to active + healthy sandboxes", async () => {
    const subqueryChain = makeSelectChain();
    const mainChain = makeSelectChain([{ id: "sb-1", capacity: 5, assignmentCount: 0 }]);

    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? subqueryChain : mainChain;
    });

    await repo.findBestAvailableSandbox();

    // Verify eq() was called with status="active" and healthStatus="healthy"
    expect(eq).toHaveBeenCalledWith("status", "active");
    expect(eq).toHaveBeenCalledWith("health_status", "healthy");
    // Verify and() was called to combine both predicates
    expect(and).toHaveBeenCalled();
  });

  it("returns null when all sandboxes are unhealthy (filtered out by WHERE)", async () => {
    // WHERE active+healthy filters everything out → empty result set
    const subqueryChain = makeSelectChain();
    const mainChain = makeSelectChain([]);

    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? subqueryChain : mainChain;
    });

    const result = await repo.findBestAvailableSandbox();
    expect(result).toBeNull();
  });

  it("returns null when all sandboxes are inactive (filtered out by WHERE)", async () => {
    // WHERE active+healthy filters inactive sandboxes → empty result set
    const subqueryChain = makeSelectChain();
    const mainChain = makeSelectChain([]);

    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? subqueryChain : mainChain;
    });

    const result = await repo.findBestAvailableSandbox();
    expect(result).toBeNull();
  });
});
