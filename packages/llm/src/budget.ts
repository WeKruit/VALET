/**
 * Token budget enforcement.
 *
 * Tracks LLM spend per application and per user (daily).
 * Uses Redis for persistence and atomic operations.
 *
 * Keys:
 *   budget:app:{applicationId}   -> { tokens, costUsd }
 *   budget:user:{userId}:{date}  -> { tokens, costUsd }
 */
import type { TokenUsage } from "./providers/base.js";

export interface BudgetConfig {
  /** Max cost per application in USD (default: $0.10) */
  perApplicationMaxUsd: number;
  /** Max cost per user per day in USD (default: $5.00) */
  perUserDailyMaxUsd: number;
  /** Redis TTL for per-application keys in seconds (default: 7 days) */
  applicationKeyTtl: number;
  /** Redis TTL for per-user daily keys in seconds (default: 2 days) */
  userDailyKeyTtl: number;
}

export interface BudgetEntry {
  totalTokens: number;
  costUsd: number;
  requestCount: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  currentSpend: number;
  maxSpend: number;
  remainingUsd: number;
}

const DEFAULT_CONFIG: BudgetConfig = {
  perApplicationMaxUsd: 0.1,
  perUserDailyMaxUsd: 5.0,
  applicationKeyTtl: 7 * 24 * 3600, // 7 days
  userDailyKeyTtl: 2 * 24 * 3600, // 2 days
};

/**
 * Redis-backed token budget tracker.
 *
 * Pass a Redis-compatible client implementing get/set/incrby commands.
 */
export class BudgetTracker {
  private config: BudgetConfig;
  private redis: RedisLike;

  constructor(redis: RedisLike, config?: Partial<BudgetConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check whether an application is within budget.
   */
  async checkApplicationBudget(
    applicationId: string,
  ): Promise<BudgetCheckResult> {
    const key = `budget:app:${applicationId}`;
    const entry = await this.getEntry(key);
    const remaining = this.config.perApplicationMaxUsd - entry.costUsd;

    return {
      allowed: remaining > 0,
      reason: remaining <= 0 ? "Per-application budget exceeded" : undefined,
      currentSpend: entry.costUsd,
      maxSpend: this.config.perApplicationMaxUsd,
      remainingUsd: Math.max(0, remaining),
    };
  }

  /**
   * Check whether a user is within their daily budget.
   */
  async checkUserDailyBudget(userId: string): Promise<BudgetCheckResult> {
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `budget:user:${userId}:${dateStr}`;
    const entry = await this.getEntry(key);
    const remaining = this.config.perUserDailyMaxUsd - entry.costUsd;

    return {
      allowed: remaining > 0,
      reason: remaining <= 0 ? "Daily user budget exceeded" : undefined,
      currentSpend: entry.costUsd,
      maxSpend: this.config.perUserDailyMaxUsd,
      remainingUsd: Math.max(0, remaining),
    };
  }

  /**
   * Record token usage for an application and user.
   * Should be called after every LLM request.
   */
  async recordUsage(
    applicationId: string,
    userId: string,
    usage: TokenUsage,
    model: string,
  ): Promise<void> {
    const dateStr = new Date().toISOString().slice(0, 10);
    const appKey = `budget:app:${applicationId}`;
    const userKey = `budget:user:${userId}:${dateStr}`;

    // Atomically update both counters
    await Promise.all([
      this.incrementEntry(appKey, usage, this.config.applicationKeyTtl),
      this.incrementEntry(userKey, usage, this.config.userDailyKeyTtl),
    ]);

    // Store individual request log for audit
    const logKey = `budget:log:${applicationId}`;
    const logEntry = JSON.stringify({
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
      timestamp: new Date().toISOString(),
    });
    await this.redis.rpush(logKey, logEntry);
    await this.redis.expire(logKey, this.config.applicationKeyTtl);
  }

  /**
   * Get current spend for an application.
   */
  async getApplicationSpend(applicationId: string): Promise<BudgetEntry> {
    return this.getEntry(`budget:app:${applicationId}`);
  }

  /**
   * Get current daily spend for a user.
   */
  async getUserDailySpend(userId: string): Promise<BudgetEntry> {
    const dateStr = new Date().toISOString().slice(0, 10);
    return this.getEntry(`budget:user:${userId}:${dateStr}`);
  }

  private async getEntry(key: string): Promise<BudgetEntry> {
    const raw = await this.redis.get(key);
    if (!raw) {
      return { totalTokens: 0, costUsd: 0, requestCount: 0 };
    }
    return JSON.parse(raw) as BudgetEntry;
  }

  private async incrementEntry(
    key: string,
    usage: TokenUsage,
    ttl: number,
  ): Promise<void> {
    const current = await this.getEntry(key);
    const updated: BudgetEntry = {
      totalTokens: current.totalTokens + usage.totalTokens,
      costUsd: current.costUsd + usage.costUsd,
      requestCount: current.requestCount + 1,
    };
    await this.redis.set(key, JSON.stringify(updated), "EX", ttl);
  }
}

/**
 * Minimal Redis-like interface for budget tracking.
 * Compatible with ioredis and node-redis.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, ttl: number): Promise<unknown>;
  rpush(key: string, value: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
}
