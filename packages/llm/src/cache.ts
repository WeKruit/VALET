/**
 * Form analysis caching layer.
 *
 * Caches LLM-generated form analysis results by URL + content hash.
 * Uses SHA256 for cache key generation and Redis with 7-day TTL.
 */
import { createHash } from "node:crypto";
import type { RedisLike } from "./budget.js";

export interface CacheConfig {
  /** TTL in seconds (default: 7 days) */
  ttlSeconds: number;
  /** Key prefix in Redis */
  prefix: string;
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttlSeconds: 7 * 24 * 3600, // 7 days
  prefix: "llm:cache",
};

export class LLMCache {
  private redis: RedisLike;
  private config: CacheConfig;

  constructor(redis: RedisLike, config?: Partial<CacheConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Generate a cache key from URL and content hash.
   */
  generateKey(url: string, contentHash?: string): string {
    const input = contentHash ? `${url}:${contentHash}` : url;
    const hash = createHash("sha256").update(input).digest("hex");
    return `${this.config.prefix}:${hash}`;
  }

  /**
   * Generate a SHA256 hash of content (e.g., form HTML).
   */
  hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Get a cached value.
   */
  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  /**
   * Set a cached value with TTL.
   */
  async set<T>(key: string, value: T): Promise<void> {
    await this.redis.set(
      key,
      JSON.stringify(value),
      "EX",
      this.config.ttlSeconds,
    );
  }

  /**
   * Get or compute: returns cached value or runs the factory and caches.
   */
  async getOrCompute<T>(
    url: string,
    contentHash: string | undefined,
    factory: () => Promise<T>,
  ): Promise<{ data: T; cached: boolean }> {
    const key = this.generateKey(url, contentHash);
    const cached = await this.get<T>(key);

    if (cached !== null) {
      return { data: cached, cached: true };
    }

    const data = await factory();
    await this.set(key, data);
    return { data, cached: false };
  }
}
