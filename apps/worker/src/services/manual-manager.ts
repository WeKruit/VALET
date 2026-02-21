import { eq, and, gte, lt, sql, asc } from "drizzle-orm";
import { actionManuals, manualSteps, type Database } from "@valet/db";
import pino from "pino";

const logger = pino({ name: "manual-manager" });

export type ActionManual = typeof actionManuals.$inferSelect;
export type ManualStep = typeof manualSteps.$inferSelect;
export type NewManualStep = typeof manualSteps.$inferInsert;

export interface ManualWithSteps {
  manual: ActionManual;
  steps: ManualStep[];
}

/** Raw action trace captured during Explore mode. */
export interface ActionTraceStep {
  action: string;
  selector: string | null;
  fallbackSelector?: string | null;
  value?: string | null;
  description: string;
  elementType?: string | null;
  waitAfterMs?: number;
}

export interface ActionTrace {
  steps: ActionTraceStep[];
  url: string;
  platform: string;
  success: boolean;
  durationMs: number;
}

const HEALTH_THRESHOLD = 0.7;

export class ManualManager {
  constructor(private db: Database) {}

  /**
   * Find a healthy manual matching the given URL and platform.
   * Returns the manual with the highest health score, or null.
   */
  async findManual(url: string, platform: string): Promise<ActionManual | null> {
    const manuals = await this.db
      .select()
      .from(actionManuals)
      .where(
        and(
          eq(actionManuals.platform, platform as ActionManual["platform"]),
          gte(actionManuals.healthScore, HEALTH_THRESHOLD),
        ),
      );

    // Test each manual's URL pattern against the provided URL
    let bestMatch: ActionManual | null = null;
    let bestScore = -1;

    for (const manual of manuals) {
      try {
        const regex = new RegExp(manual.urlPattern);
        if (regex.test(url) && manual.healthScore > bestScore) {
          bestMatch = manual;
          bestScore = manual.healthScore;
        }
      } catch {
        logger.warn(
          { manualId: manual.id, urlPattern: manual.urlPattern },
          "Invalid regex in url_pattern, skipping",
        );
      }
    }

    return bestMatch;
  }

  /** Fetch a manual and its steps ordered by step_order. */
  async getManualWithSteps(manualId: string): Promise<ManualWithSteps> {
    const [manualRows, stepRows] = await Promise.all([
      this.db
        .select()
        .from(actionManuals)
        .where(eq(actionManuals.id, manualId))
        .limit(1),
      this.db
        .select()
        .from(manualSteps)
        .where(eq(manualSteps.manualId, manualId))
        .orderBy(asc(manualSteps.stepOrder)),
    ]);

    const manual = manualRows[0];
    if (!manual) {
      throw new Error(`Manual not found: ${manualId}`);
    }

    return { manual, steps: stepRows };
  }

  /**
   * Create a new manual from an action trace recorded during Explore mode.
   * Returns the new manual ID.
   */
  async createManualFromTrace(
    trace: ActionTrace,
    url: string,
    platform: string,
  ): Promise<string> {
    const urlPattern = generateUrlPattern(url);
    const name = `${platform} - Auto-generated ${new Date().toISOString().slice(0, 10)}`;

    const [manual] = await this.db
      .insert(actionManuals)
      .values({
        urlPattern,
        platform: platform as ActionManual["platform"],
        name,
        healthScore: 1.0,
        totalRuns: 1,
        successCount: trace.success ? 1 : 0,
        failureCount: trace.success ? 0 : 1,
        lastUsedAt: new Date(),
      })
      .returning();

    if (!manual) {
      throw new Error("Failed to create manual");
    }

    // Convert trace steps to manual_steps records
    if (trace.steps.length > 0) {
      const stepValues: NewManualStep[] = trace.steps.map((step, idx) => ({
        manualId: manual.id,
        stepOrder: idx + 1,
        action: step.action,
        selector: step.selector,
        fallbackSelector: step.fallbackSelector ?? null,
        value: step.value ?? null,
        description: step.description,
        elementType: step.elementType ?? null,
        waitAfterMs: step.waitAfterMs ?? 500,
      }));

      await this.db.insert(manualSteps).values(stepValues);
    }

    logger.info(
      { manualId: manual.id, platform, urlPattern, stepCount: trace.steps.length },
      "Created manual from trace",
    );

    return manual.id;
  }

  /** Update health score after a run completes. */
  async updateHealthScore(manualId: string, success: boolean): Promise<void> {
    await this.db
      .update(actionManuals)
      .set({
        totalRuns: sql`${actionManuals.totalRuns} + 1`,
        successCount: success
          ? sql`${actionManuals.successCount} + 1`
          : actionManuals.successCount,
        failureCount: success
          ? actionManuals.failureCount
          : sql`${actionManuals.failureCount} + 1`,
        healthScore: success
          ? sql`(${actionManuals.successCount} + 1)::real / (${actionManuals.totalRuns} + 1)::real`
          : sql`${actionManuals.successCount}::real / (${actionManuals.totalRuns} + 1)::real`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(actionManuals.id, manualId));

    logger.info({ manualId, success }, "Updated manual health score");
  }

  /**
   * Delete manuals with health scores below threshold that have enough runs
   * to be statistically meaningful. Returns the count of deleted manuals.
   */
  async deactivateUnhealthyManuals(threshold: number = 0.5): Promise<number> {
    const deleted = await this.db
      .delete(actionManuals)
      .where(
        and(
          lt(actionManuals.healthScore, threshold),
          gte(actionManuals.totalRuns, 5),
        ),
      )
      .returning({ id: actionManuals.id });

    if (deleted.length > 0) {
      logger.info(
        { count: deleted.length, threshold },
        "Deactivated unhealthy manuals",
      );
    }

    return deleted.length;
  }
}

/**
 * Generate a URL pattern regex from a concrete URL.
 * Replaces numeric path segments and query params with regex wildcards.
 */
function generateUrlPattern(url: string): string {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/\./g, "\\.");

  let path = parsed.pathname;
  // Replace numeric-only path segments with \d+
  path = path.replace(/\/\d+/g, "/\\d+");
  // Replace UUID-like segments
  path = path.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "/[0-9a-f-]{36}",
  );
  // Replace path segments that look like slugs/identifiers (keep the structure)
  // e.g., /company-name/ stays as /[^/]+/
  path = path.replace(/\/[a-z0-9][-a-z0-9]*[a-z0-9](?=\/)/gi, "/[^/]+");

  return `${host}${path}`;
}

export { generateUrlPattern };
