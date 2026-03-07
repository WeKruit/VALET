import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CreditService } from "../credit.service.js";

// ── Mock DB that tracks sequential query chains ──
// Follows the same pattern as referral.service.test.ts

function makeMockDb(queryResults: unknown[]) {
  let queryIdx = 0;

  function makeChain(): Record<string, ReturnType<typeof vi.fn>> {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const terminal = () => {
      const result = queryResults[queryIdx] ?? [];
      queryIdx++;
      return result;
    };

    chain.select = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockImplementation(() => Promise.resolve(terminal()));
    chain.groupBy = vi.fn().mockImplementation(() => Promise.resolve(terminal()));
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.offset = vi.fn().mockReturnValue(chain);
    chain.set = vi.fn().mockReturnValue(chain);
    chain.values = vi.fn().mockImplementation(() => Promise.resolve(terminal()));
    chain.update = vi.fn().mockReturnValue(chain);
    chain.insert = vi.fn().mockReturnValue(chain);

    chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => {
      return Promise.resolve(terminal()).then(resolve);
    });

    return chain;
  }

  const chain = makeChain();
  const db = {
    select: vi.fn().mockReturnValue(chain),
    update: vi.fn().mockReturnValue(chain),
    insert: vi.fn().mockReturnValue(chain),
    execute: vi.fn().mockImplementation(() => {
      const result = queryResults[queryIdx] ?? [];
      queryIdx++;
      return Promise.resolve(result);
    }),
  };

  return { db, chain };
}

describe("CreditService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getCostConfig()", () => {
    it("returns all 5 cost types", () => {
      const { db } = makeMockDb([]);
      const service = new CreditService({ db: db as never });

      const config = service.getCostConfig();

      expect(config.costs).toHaveLength(5);
      const costTypes = config.costs.map((c) => c.costType);
      expect(costTypes).toContain("task_application");
      expect(costTypes).toContain("batch_application");
      expect(costTypes).toContain("premium_analysis");
      expect(costTypes).toContain("resume_optimization");
      expect(costTypes).toContain("cover_letter");
    });
  });

  describe("getCostForType()", () => {
    it("returns correct credit amounts for each cost type", () => {
      const { db } = makeMockDb([]);
      const service = new CreditService({ db: db as never });

      expect(service.getCostForType("task_application")).toBe(35);
      expect(service.getCostForType("batch_application")).toBe(25);
      expect(service.getCostForType("premium_analysis")).toBe(100);
      expect(service.getCostForType("resume_optimization")).toBe(50);
      expect(service.getCostForType("cover_letter")).toBe(40);
    });
  });

  describe("consumeCredits()", () => {
    it("returns actual balance (not -1) when enforcement is disabled", async () => {
      process.env.FEATURE_CREDITS_ENFORCEMENT = "false";

      const { db } = makeMockDb([
        // getBalance query: select...from...where...limit
        [{ creditBalance: 500, trialCreditsExpireAt: null }],
      ]);

      const service = new CreditService({ db: db as never });
      const result = await service.consumeCredits("user-1", "task_application");

      expect(result.success).toBe(true);
      expect(result.balance).toBe(500);
      expect(result.creditsUsed).toBe(0);
      expect(result.message).toBe("Enforcement disabled");
    });

    it("succeeds when user has sufficient balance", async () => {
      process.env.FEATURE_CREDITS_ENFORCEMENT = "true";

      const { db } = makeMockDb([
        // db.execute for atomic debit — returns rows with balance_after
        { rows: [{ balance_after: 465 }] },
      ]);

      const service = new CreditService({ db: db as never });
      const result = await service.consumeCredits("user-1", "task_application");

      expect(result.success).toBe(true);
      expect(result.balance).toBe(465);
      expect(result.creditsUsed).toBe(35);
    });

    it("fails with message when balance is insufficient", async () => {
      process.env.FEATURE_CREDITS_ENFORCEMENT = "true";

      const { db } = makeMockDb([
        // db.execute for atomic debit — no rows (insufficient balance)
        { rows: [] },
        // getBalance fallback: select...from...where...limit
        [{ creditBalance: 10, trialCreditsExpireAt: null }],
      ]);

      const service = new CreditService({ db: db as never });
      const result = await service.consumeCredits("user-1", "task_application");

      expect(result.success).toBe(false);
      expect(result.balance).toBe(10);
      expect(result.creditsUsed).toBe(0);
      expect(result.message).toBe("Insufficient credits. Need 35, have 10");
    });
  });

  describe("grantCredits()", () => {
    it("returns updated balance after granting credits", async () => {
      const { db } = makeMockDb([
        // db.execute for grant — returns rows with balance_after
        { rows: [{ balance_after: 150 }] },
      ]);

      const service = new CreditService({ db: db as never });
      const result = await service.grantCredits("user-1", 100, "admin_grant", {
        description: "Manual top-up",
      });

      expect(result.balance).toBe(150);
    });
  });
});
