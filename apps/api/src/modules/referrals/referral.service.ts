import { eq, sql, and } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { users, referrals, type Database } from "@valet/db";
import { CREDITS } from "@valet/shared/constants";
import type { CreditService } from "../credits/credit.service.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(length = 8): string {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return result;
}

export class ReferralService {
  private db: Database;
  private creditService: CreditService;

  constructor({ db, creditService }: { db: Database; creditService: CreditService }) {
    this.db = db;
    this.creditService = creditService;
  }

  async getOrCreateCode(userId: string): Promise<string> {
    // Check if user already has a code
    const row = await this.db
      .select({ myReferralCode: users.myReferralCode })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (row[0]?.myReferralCode) {
      return row[0].myReferralCode;
    }

    // Generate unique code with retry
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      try {
        await this.db
          .update(users)
          .set({ myReferralCode: code, updatedAt: new Date() })
          .where(and(eq(users.id, userId), sql`my_referral_code IS NULL`));

        // Re-read to handle race condition
        const updated = await this.db
          .select({ myReferralCode: users.myReferralCode })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (updated[0]?.myReferralCode) {
          return updated[0].myReferralCode;
        }
      } catch {
        // Unique constraint violation — retry with new code
        continue;
      }
    }

    throw new Error("Failed to generate unique referral code");
  }

  async claimReferral(
    referredUserId: string,
    code: string,
  ): Promise<{ claimed: boolean; message: string }> {
    // Look up referrer
    const referrerRow = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.myReferralCode, code.toUpperCase()))
      .limit(1);

    if (!referrerRow[0]) {
      return { claimed: false, message: "Invalid referral code" };
    }

    const referrerUserId = referrerRow[0].id;

    // Self-referral check
    if (referrerUserId === referredUserId) {
      return { claimed: false, message: "Cannot use your own referral code" };
    }

    // Check if already claimed (idempotent)
    const existing = await this.db
      .select({ id: referrals.id })
      .from(referrals)
      .where(eq(referrals.referredUserId, referredUserId))
      .limit(1);

    if (existing[0]) {
      return { claimed: true, message: "Referral already claimed" };
    }

    // Insert referral record
    try {
      await this.db.insert(referrals).values({
        referrerUserId,
        referredUserId,
        referralCode: code.toUpperCase(),
        status: "pending",
      });
      return { claimed: true, message: "Referral claimed successfully" };
    } catch {
      // Unique constraint — already claimed
      return { claimed: true, message: "Referral already claimed" };
    }
  }

  async activateReferral(
    referredUserId: string,
  ): Promise<{ id: string; referrerUserId: string } | null> {
    // Find pending referral, or a completed-but-unrewarded referral (crash recovery)
    const ref = await this.db
      .select()
      .from(referrals)
      .where(
        and(
          eq(referrals.referredUserId, referredUserId),
          sql`(${referrals.status} = 'pending' OR (${referrals.status} = 'completed' AND ${referrals.rewardCreditsIssued} = 0))`,
        ),
      )
      .limit(1);

    if (!ref[0]) return null;

    // Mark as completed (idempotent — already completed in crash recovery case)
    if (ref[0].status === "pending") {
      await this.db
        .update(referrals)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(referrals.id, ref[0].id));
    }

    return { id: ref[0].id, referrerUserId: ref[0].referrerUserId };
  }

  async updateRewardCreditsIssued(referralId: string, amount: number): Promise<void> {
    await this.db
      .update(referrals)
      .set({ rewardCreditsIssued: amount })
      .where(eq(referrals.id, referralId));
  }

  /**
   * Activate a referral AND grant reward credits to both referrer and referee.
   * Called when the referred user completes their first qualifying action (e.g. first task).
   * Returns the total reward per party or null if no referral was pending.
   */
  async activateAndReward(
    referredUserId: string,
  ): Promise<{ rewarded: boolean; rewardAmount: number } | null> {
    const ref = await this.activateReferral(referredUserId);
    if (!ref) return null;

    const rewardAmount = CREDITS.REFERRAL_REWARD;
    const idempotencyPrefix = `referral_reward_${ref.id}`;

    return this.db.transaction(async (tx) => {
      // Grant credits to referrer
      await this.creditService.grantCredits(ref.referrerUserId, rewardAmount, "referral_reward", {
        description: "Referral reward — your friend completed their first task",
        referenceType: "referral",
        referenceId: ref.id,
        idempotencyKey: `${idempotencyPrefix}_referrer`,
        tx,
      });

      // Grant credits to referee
      await this.creditService.grantCredits(referredUserId, rewardAmount, "referral_reward", {
        description: "Referral bonus — welcome reward for joining via referral",
        referenceType: "referral",
        referenceId: ref.id,
        idempotencyKey: `${idempotencyPrefix}_referee`,
        tx,
      });

      // Mark reward as issued (within transaction)
      await tx
        .update(referrals)
        .set({ rewardCreditsIssued: rewardAmount })
        .where(eq(referrals.id, ref.id));

      return { rewarded: true, rewardAmount };
    });
  }

  async getStats(userId: string) {
    const code = await this.getOrCreateCode(userId);

    const rows = await this.db
      .select({
        status: referrals.status,
        count: sql<number>`count(*)`,
      })
      .from(referrals)
      .where(eq(referrals.referrerUserId, userId))
      .groupBy(referrals.status);

    const [rewardedResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(referrals)
      .where(and(eq(referrals.referrerUserId, userId), sql`${referrals.rewardCreditsIssued} > 0`));

    let totalReferred = 0;
    let pendingCount = 0;
    let activatedCount = 0;

    for (const row of rows) {
      const count = Number(row.count);
      totalReferred += count;
      if (row.status === "pending") pendingCount = count;
      if (row.status === "completed") activatedCount = count;
    }

    return {
      code,
      totalReferred,
      pendingCount,
      activatedCount,
      rewardedCount: Number(rewardedResult?.count ?? 0),
    };
  }
}
