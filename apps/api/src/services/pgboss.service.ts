import { PgBoss } from "pg-boss";
import type { FastifyBaseLogger } from "fastify";

/**
 * PgBossService — Singleton wrapper around pg-boss for task queue management.
 *
 * pg-boss requires a session-mode Postgres connection (not transaction pooler)
 * because it uses LISTEN/NOTIFY and advisory locks. Always use DATABASE_DIRECT_URL.
 *
 * In test/CI mode, maintenance features are disabled (supervise: false)
 * so tests don't need a live Postgres connection for queue management.
 */
export class PgBossService {
  private boss: PgBoss | null = null;
  private logger: FastifyBaseLogger;
  private started = false;

  constructor({ logger }: { logger: FastifyBaseLogger }) {
    this.logger = logger;
  }

  async start(): Promise<void> {
    if (this.started) return;

    const connectionString = process.env.DATABASE_DIRECT_URL;
    if (!connectionString) {
      this.logger.warn(
        "DATABASE_DIRECT_URL not set — pg-boss disabled. Task queue features unavailable.",
      );
      return;
    }

    const isTest = process.env.NODE_ENV === "test";

    this.boss = new PgBoss({
      connectionString,
      schema: "pgboss",
      // Disable background maintenance/supervision in test mode
      supervise: !isTest,
      migrate: !isTest,
    });

    this.boss.on("error", (error: Error) => {
      this.logger.error({ err: error }, "pg-boss error");
    });

    try {
      await this.boss.start();
      this.started = true;
      this.logger.info("pg-boss started successfully (schema: pgboss)");
    } catch (err) {
      this.logger.error({ err }, "Failed to start pg-boss");
      this.boss = null;
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (!this.boss || !this.started) return;

    try {
      await this.boss.stop({ graceful: true, timeout: 10_000 });
      this.logger.info("pg-boss stopped gracefully");
    } catch (err) {
      this.logger.warn({ err }, "pg-boss stop failed — forcing");
      try {
        await this.boss.stop({ graceful: false });
      } catch {
        // Best-effort
      }
    } finally {
      this.started = false;
      this.boss = null;
    }
  }

  /**
   * Returns the raw pg-boss instance for other services to use.
   * Returns null if pg-boss is not started (e.g., DATABASE_DIRECT_URL not set).
   */
  get instance(): PgBoss | null {
    return this.boss;
  }

  get isStarted(): boolean {
    return this.started;
  }
}
