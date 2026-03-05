import { eq, sql, desc } from "drizzle-orm";
import { users, creditLedger, type Database } from "@valet/db";

export class CreditService {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
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
    };
  }

  async getLedger(userId: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;

    const [entries, countResult] = await Promise.all([
      this.db
        .select()
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
    } = {},
  ): Promise<{ balance: number }> {
    // Idempotency check
    if (opts.idempotencyKey) {
      const existing = await this.db
        .select({ id: creditLedger.id })
        .from(creditLedger)
        .where(eq(creditLedger.idempotencyKey, opts.idempotencyKey))
        .limit(1);
      if (existing[0]) {
        const bal = await this.getBalance(userId);
        return { balance: bal.balance };
      }
    }

    // Use raw SQL for atomic update + insert
    const result = await this.db.execute(sql`
      WITH updated AS (
        UPDATE users
        SET credit_balance = credit_balance + ${amount},
            trial_credits_expire_at = COALESCE(${opts.trialExpiresAt ?? null}::timestamptz, trial_credits_expire_at),
            updated_at = NOW()
        WHERE id = ${userId}::uuid
        RETURNING credit_balance
      )
      INSERT INTO credit_ledger (user_id, delta, balance_after, reason, description, reference_type, reference_id, idempotency_key)
      SELECT ${userId}::uuid, ${amount}, credit_balance, ${reason}, ${opts.description ?? null}, ${opts.referenceType ?? null}, ${opts.referenceId ?? null}::uuid, ${opts.idempotencyKey ?? null}
      FROM updated
      RETURNING balance_after
    `);

    const newBalance =
      (result as unknown as { rows: Array<{ balance_after: number }> }).rows[0]?.balance_after ?? 0;
    return { balance: newBalance };
  }

  async debitForTask(
    userId: string,
    taskId: string,
    idempotencyKey: string,
  ): Promise<{ success: boolean; balance: number }> {
    // Feature flag check
    if (process.env.FEATURE_CREDITS_ENFORCEMENT !== "true") {
      return { success: true, balance: -1 };
    }

    // Idempotency check
    const existing = await this.db
      .select({ id: creditLedger.id, balanceAfter: creditLedger.balanceAfter })
      .from(creditLedger)
      .where(eq(creditLedger.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing[0]) {
      return { success: true, balance: existing[0].balanceAfter };
    }

    // Atomic debit with balance check (row-level lock via FOR UPDATE)
    try {
      const result = await this.db.execute(sql`
        WITH locked AS (
          SELECT id, credit_balance FROM users WHERE id = ${userId}::uuid FOR UPDATE
        ),
        check_balance AS (
          SELECT id, credit_balance FROM locked WHERE credit_balance > 0
        ),
        updated AS (
          UPDATE users
          SET credit_balance = credit_balance - 1, updated_at = NOW()
          WHERE id = (SELECT id FROM check_balance)
          RETURNING credit_balance
        )
        INSERT INTO credit_ledger (user_id, delta, balance_after, reason, description, reference_type, reference_id, idempotency_key)
        SELECT ${userId}::uuid, -1, credit_balance, 'task_debit', 'Task application credit', 'task', ${taskId}::uuid, ${idempotencyKey}
        FROM updated
        RETURNING balance_after
      `);

      const rows = (result as unknown as { rows: Array<{ balance_after: number }> }).rows;
      if (!rows[0]) {
        // Balance was 0 — no update happened
        return { success: false, balance: 0 };
      }
      return { success: true, balance: rows[0].balance_after };
    } catch {
      return { success: false, balance: 0 };
    }
  }

  async refundTask(
    userId: string,
    taskId: string,
    idempotencyKey: string,
    reason = "Pre-accept failure refund",
  ): Promise<{ balance: number }> {
    return this.grantCredits(userId, 1, "task_refund", {
      description: reason,
      referenceType: "task",
      referenceId: taskId,
      idempotencyKey,
    });
  }
}
