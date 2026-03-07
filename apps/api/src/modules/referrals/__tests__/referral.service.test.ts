import { describe, it, expect, vi } from "vitest";
import { ReferralService } from "../referral.service.js";
import type { CreditService } from "../../credits/credit.service.js";

const mockCreditService = {
  grantCredits: vi.fn().mockResolvedValue({ balance: 100 }),
} as unknown as CreditService;

// ── Mock DB that tracks sequential query chains ──

function makeMockDb(queryResults: unknown[][]) {
  let queryIdx = 0;

  function makeChain(): Record<string, ReturnType<typeof vi.fn>> {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const terminal = () => {
      const result = queryResults[queryIdx] ?? [];
      queryIdx++;
      return result;
    };

    // Each method returns the chain (for chaining), except terminals that resolve.
    // Terminal detection: limit, groupBy, and where (when it's the last in chain).
    // We make ALL methods return chain, but also make chain thenable so `await chain` resolves.
    chain.select = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockImplementation(() => Promise.resolve(terminal()));
    chain.groupBy = vi.fn().mockImplementation(() => Promise.resolve(terminal()));
    chain.set = vi.fn().mockReturnValue(chain);
    chain.values = vi.fn().mockImplementation(() => Promise.resolve(terminal()));
    chain.update = vi.fn().mockReturnValue(chain);
    chain.insert = vi.fn().mockReturnValue(chain);

    // Make chain itself thenable (for queries that end with .where() and are awaited)
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
  };

  return { db, chain };
}

describe("ReferralService", () => {
  describe("activateReferral()", () => {
    it("returns { id, referrerUserId } when a pending referral exists", async () => {
      const { db } = makeMockDb([
        // Query 1: find pending referral via select...where...limit
        [
          {
            id: "ref-1",
            referrerUserId: "referrer-user",
            referredUserId: "referred-user",
            status: "pending",
          },
        ],
        // Query 2: update...set...where (returns via thenable)
        [],
      ]);

      const service = new ReferralService({ db: db as never, creditService: mockCreditService });
      const result = await service.activateReferral("referred-user");

      expect(result).toEqual({ id: "ref-1", referrerUserId: "referrer-user" });
    });

    it("returns null when no pending referral exists", async () => {
      const { db } = makeMockDb([
        // Query 1: find pending referral — empty
        [],
      ]);

      const service = new ReferralService({ db: db as never, creditService: mockCreditService });
      const result = await service.activateReferral("user-no-referral");

      expect(result).toBeNull();
    });
  });

  describe("updateRewardCreditsIssued()", () => {
    it("calls update with the correct referral id and amount", async () => {
      const { db, chain } = makeMockDb([[]]);

      const service = new ReferralService({ db: db as never, creditService: mockCreditService });
      await service.updateRewardCreditsIssued("ref-123", 5);

      expect(db.update).toHaveBeenCalled();
      expect(chain.set).toHaveBeenCalledWith({ rewardCreditsIssued: 5 });
    });
  });

  describe("getStats()", () => {
    it("computes rewardedCount from rewardCreditsIssued > 0", async () => {
      const { db } = makeMockDb([
        // Query 1: getOrCreateCode -> select...where...limit -> user with code
        [{ myReferralCode: "ABC123" }],
        // Query 2: status group-by -> select...from...where...groupBy
        [
          { status: "pending", count: 2 },
          { status: "completed", count: 3 },
        ],
        // Query 3: rewarded count -> select...from...where (thenable, destructured as array)
        [{ count: 1 }],
      ]);

      const service = new ReferralService({ db: db as never, creditService: mockCreditService });
      const stats = await service.getStats("user-1");

      expect(stats.code).toBe("ABC123");
      expect(stats.totalReferred).toBe(5);
      expect(stats.pendingCount).toBe(2);
      expect(stats.activatedCount).toBe(3);
      expect(stats.rewardedCount).toBe(1);
    });

    it("returns rewardedCount 0 when no referrals have been rewarded", async () => {
      const { db } = makeMockDb([
        [{ myReferralCode: "XYZ789" }],
        [{ status: "completed", count: 2 }],
        [{ count: 0 }],
      ]);

      const service = new ReferralService({ db: db as never, creditService: mockCreditService });
      const stats = await service.getStats("user-2");

      expect(stats.rewardedCount).toBe(0);
    });
  });
});
