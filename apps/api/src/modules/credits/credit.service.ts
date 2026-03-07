import { eq, sql, desc } from "drizzle-orm";
import { users, creditLedger, type Database } from "@valet/db";
import type { CreditCostType } from "@valet/shared/schemas";

// ─── Credit cost configuration ───
// Credits derived from platform costs via: credits = ceil(330 * sqrt(baseCost))
// Base costs: task_application=$0.01, batch=$0.008, analysis=$0.08, resume=$0.03, cover_letter=$0.02
const CREDIT_COSTS: Record<
  CreditCostType,
  { credits: number; label: string; description: string }
> = {
  task_application: {
    credits: 35,
    label: "Job Application",
    description: "Submit a single job application via automation",
  },
  batch_application: {
    credits: 25,
    label: "Batch Application",
    description: "Each application within a batch run",
  },
  premium_analysis: {
    credits: 100,
    label: "Premium Job Analysis",
    description: "Deep AI analysis of job-fit scoring and recommendations",
  },
  resume_optimization: {
    credits: 50,
    label: "Resume Optimization",
    description: "AI-powered resume tailoring for a specific job",
  },
  cover_letter: {
    credits: 40,
    label: "Cover Letter Generation",
    description: "AI-generated cover letter customized to a job posting",
  },
};

export class CreditService {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  /** Return the full cost configuration for all operation types */
  getCostConfig() {
    return {
      costs: Object.entries(CREDIT_COSTS).map(([costType, config]) => ({
        costType: costType as CreditCostType,
        ...config,
      })),
    };
  }

  /** Look up the credit cost for a given cost type */
  getCostForType(costType: CreditCostType): number {
    return CREDIT_COSTS[costType].credits;
  }

  async getBalance(userId: string) {
    const row = await this.db
      .select({
        creditBalance: users.creditBalance,
        trialCreditsExpireAt: users.trialCreditsExpireAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return {
      balance: row[0]?.creditBalance ?? 0,
      trialExpiry: row[0]?.trialCreditsExpireAt?.toISOString() ?? null,
      enforcementEnabled: process.env.FEATURE_CREDITS_ENFORCEMENT === "true",
    };
  }

  async getLedger(userId: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;

    const [entries, countResult] = await Promise.all([
      this.db
        .select({
          id: creditLedger.id,
          delta: creditLedger.delta,
          balanceAfter: creditLedger.balanceAfter,
          reason: creditLedger.reason,
          description: creditLedger.description,
          referenceType: creditLedger.referenceType,
          referenceId: creditLedger.referenceId,
          createdAt: creditLedger.createdAt,
        })
        .from(creditLedger)
        .where(eq(creditLedger.userId, userId))
        .orderBy(desc(creditLedger.createdAt))
        .offset(offset)
        .limit(pageSize),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(creditLedger)
        .where(eq(creditLedger.userId, userId)),
    ]);

    return {
      entries,
      total: Number(countResult[0]?.count ?? 0),
      page,
      pageSize,
    };
  }

  async grantCredits(
    userId: string,
    amount: number,
    reason: string,
    opts: {
      description?: string;
      referenceType?: string;
      referenceId?: string;
      idempotencyKey?: string;
      trialExpiresAt?: Date;
      tx?: Pick<Database, "execute">;
    } = {},
  ): Promise<{ balance: number }> {
    const db = opts.tx ?? this.db;

    if (opts.idempotencyKey) {
      // Single-statement atomic grant with ON CONFLICT for idempotency.
      // If the idempotency_key already exists, the INSERT is skipped (no row returned),
      // and we fall through to read the current balance.
      const result = await db.execute(sql`
        WITH updated AS (
          UPDATE users
          SET credit_balance = credit_balance + ${amount},
              trial_credits_expire_at = COALESCE(${opts.trialExpiresAt ?? null}::timestamptz, trial_credits_expire_at),
              updated_at = NOW()
          WHERE id = ${userId}::uuid
            AND NOT EXISTS (SELECT 1 FROM credit_ledger WHERE idempotency_key = ${opts.idempotencyKey})
          RETURNING credit_balance
        )
        INSERT INTO credit_ledger (user_id, delta, balance_after, reason, description, reference_type, reference_id, idempotency_key)
        SELECT ${userId}::uuid, ${amount}, credit_balance, ${reason}, ${opts.description ?? null}, ${opts.referenceType ?? null}, ${opts.referenceId ?? null}, ${opts.idempotencyKey}
        FROM updated
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING balance_after
      `);

      const rows = (result as unknown as { rows: Array<{ balance_after: number }> }).rows;
      if (rows[0]) {
        return { balance: rows[0].balance_after };
      }
      // Idempotent duplicate — read current balance via same db/tx handle
      const balRow = await db.execute(
        sql`SELECT credit_balance FROM users WHERE id = ${userId}::uuid`,
      );
      const balRows = (balRow as unknown as { rows: Array<{ credit_balance: number }> }).rows;
      return { balance: balRows[0]?.credit_balance ?? 0 };
    }

    // No idempotency key — simple grant (e.g. admin manual adjustment)
    const result = await db.execute(sql`
      WITH updated AS (
        UPDATE users
        SET credit_balance = credit_balance + ${amount},
            trial_credits_expire_at = COALESCE(${opts.trialExpiresAt ?? null}::timestamptz, trial_credits_expire_at),
            updated_at = NOW()
        WHERE id = ${userId}::uuid
        RETURNING credit_balance
      )
      INSERT INTO credit_ledger (user_id, delta, balance_after, reason, description, reference_type, reference_id, idempotency_key)
      SELECT ${userId}::uuid, ${amount}, credit_balance, ${reason}, ${opts.description ?? null}, ${opts.referenceType ?? null}, ${opts.referenceId ?? null}, ${null}
      FROM updated
      RETURNING balance_after
    `);

    const newBalance =
      (result as unknown as { rows: Array<{ balance_after: number }> }).rows[0]?.balance_after ?? 0;
    return { balance: newBalance };
  }

  /**
   * Unified cost endpoint: consume credits for any operation type.
   * Resolves the credit cost from the cost config (or uses override),
   * then atomically debits the user's balance.
   */
  async consumeCredits(
    userId: string,
    costType: CreditCostType,
    opts: {
      costAmount?: number;
      referenceType?: string;
      referenceId?: string;
      description?: string;
      idempotencyKey?: string;
    } = {},
  ): Promise<{ success: boolean; balance: number; creditsUsed: number; message?: string }> {
    // Feature flag check
    if (process.env.FEATURE_CREDITS_ENFORCEMENT !== "true") {
      const bal = await this.getBalance(userId);
      return {
        success: true,
        balance: bal.balance,
        creditsUsed: 0,
        message: "Enforcement disabled",
      };
    }

    const creditsToDebit = opts.costAmount ?? this.getCostForType(costType);
    const costDescription = opts.description ?? CREDIT_COSTS[costType].label;
    const idempotencyKey = opts.idempotencyKey ?? undefined;

    // Idempotency check
    if (idempotencyKey) {
      const existing = await this.db
        .select({ id: creditLedger.id, balanceAfter: creditLedger.balanceAfter })
        .from(creditLedger)
        .where(eq(creditLedger.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing[0]) {
        return { success: true, balance: existing[0].balanceAfter, creditsUsed: creditsToDebit };
      }
    }

    // Atomic debit with balance check + inline idempotency guard
    const result = await this.db.execute(sql`
      WITH locked AS (
        SELECT id, credit_balance FROM users WHERE id = ${userId}::uuid FOR UPDATE
      ),
      check_balance AS (
        SELECT id, credit_balance FROM locked
        WHERE credit_balance >= ${creditsToDebit}
          AND (${idempotencyKey ?? null}::text IS NULL
               OR NOT EXISTS (SELECT 1 FROM credit_ledger WHERE idempotency_key = ${idempotencyKey ?? null}))
      ),
      updated AS (
        UPDATE users
        SET credit_balance = credit_balance - ${creditsToDebit}, updated_at = NOW()
        WHERE id = (SELECT id FROM check_balance)
        RETURNING credit_balance
      )
      INSERT INTO credit_ledger (user_id, delta, balance_after, reason, description, reference_type, reference_id, idempotency_key)
      SELECT ${userId}::uuid, ${-creditsToDebit}, credit_balance, ${costType}, ${costDescription}, ${opts.referenceType ?? null}, ${opts.referenceId ?? null}, ${idempotencyKey ?? null}
      FROM updated
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING balance_after
    `);

    const rows = (result as unknown as { rows: Array<{ balance_after: number }> }).rows;
    if (!rows[0]) {
      // Could be insufficient balance OR idempotent duplicate — check which
      if (idempotencyKey) {
        const dup = await this.db
          .select({ balanceAfter: creditLedger.balanceAfter })
          .from(creditLedger)
          .where(eq(creditLedger.idempotencyKey, idempotencyKey))
          .limit(1);
        if (dup[0]) {
          return { success: true, balance: dup[0].balanceAfter, creditsUsed: creditsToDebit };
        }
      }
      const bal = await this.getBalance(userId);
      return {
        success: false,
        balance: bal.balance,
        creditsUsed: 0,
        message: `Insufficient credits. Need ${creditsToDebit}, have ${bal.balance}`,
      };
    }
    return { success: true, balance: rows[0].balance_after, creditsUsed: creditsToDebit };
  }

  async debitForTask(
    userId: string,
    taskId: string,
    idempotencyKey: string,
    costType: CreditCostType = "task_application",
  ): Promise<{ success: boolean; balance: number }> {
    const result = await this.consumeCredits(userId, costType, {
      referenceType: "task",
      referenceId: taskId,
      idempotencyKey,
      description: CREDIT_COSTS[costType].label,
    });

    return { success: result.success, balance: result.balance };
  }

  async refundTask(
    userId: string,
    taskId: string,
    idempotencyKey: string,
    reason = "Pre-accept failure refund",
    costType: CreditCostType = "task_application",
  ): Promise<{ balance: number }> {
    return this.grantCredits(userId, CREDIT_COSTS[costType].credits, "task_refund", {
      description: reason,
      referenceType: "task",
      referenceId: taskId,
      idempotencyKey,
    });
  }
}
