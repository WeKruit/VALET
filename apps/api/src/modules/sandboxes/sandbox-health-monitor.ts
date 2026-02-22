import type { FastifyBaseLogger } from "fastify";
import type { SandboxService } from "./sandbox.service.js";
import type { SandboxHealthStatus } from "@valet/shared/schemas";

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CONSECUTIVE_FAILURE_ALERT_THRESHOLD = 3;

export class SandboxHealthMonitor {
  private sandboxService: SandboxService;
  private logger: FastifyBaseLogger;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /** Track consecutive unhealthy check counts per sandbox */
  private consecutiveFailures: Map<string, number> = new Map();

  /** Track previous health status per sandbox to detect transitions */
  private previousHealthStatus: Map<string, SandboxHealthStatus> = new Map();

  constructor({
    sandboxService,
    logger,
  }: {
    sandboxService: SandboxService;
    logger: FastifyBaseLogger;
  }) {
    this.sandboxService = sandboxService;
    this.logger = logger;
  }

  start() {
    if (this.intervalId) return;

    this.logger.info({ intervalMs: HEALTH_CHECK_INTERVAL_MS }, "Starting sandbox health monitor");

    // Run immediately on start
    this.runHealthChecks();

    this.intervalId = setInterval(() => {
      this.runHealthChecks();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info("Sandbox health monitor stopped");
    }
  }

  private async runHealthChecks() {
    try {
      this.logger.debug("Running scheduled sandbox health checks");
      const results = await this.sandboxService.checkAllSandboxes();

      if (results.length === 0) {
        this.logger.debug("No running sandboxes to health-check");
        return;
      }

      const healthy = results.filter((r) => r.healthStatus === "healthy").length;
      const degraded = results.filter((r) => r.healthStatus === "degraded").length;
      const unhealthy = results.filter((r) => r.healthStatus === "unhealthy").length;

      this.logger.info(
        { total: results.length, healthy, degraded, unhealthy },
        "Sandbox health check completed",
      );

      // Track transitions + consecutive failures for each result
      for (const result of results) {
        const prev = this.previousHealthStatus.get(result.sandboxId);
        const current = result.healthStatus;

        // Detect healthy -> unhealthy transition
        if (prev === "healthy" && (current === "unhealthy" || current === "degraded")) {
          const failedChecks = (result.details as Record<string, unknown>)?.checks;
          this.logger.warn(
            {
              sandboxId: result.sandboxId,
              previousStatus: prev,
              currentStatus: current,
              failedChecks,
              details: result.details,
            },
            `Sandbox health transition: ${prev} -> ${current}`,
          );
        }

        // Track consecutive failures
        if (current === "unhealthy" || current === "degraded") {
          const count = (this.consecutiveFailures.get(result.sandboxId) ?? 0) + 1;
          this.consecutiveFailures.set(result.sandboxId, count);

          // Log individual unhealthy at warn level
          if (current === "unhealthy") {
            this.logger.warn(
              { sandboxId: result.sandboxId, consecutiveFailures: count, details: result.details },
              "Sandbox is unhealthy",
            );
          }

          // ALERT: 3+ consecutive failures
          if (count >= CONSECUTIVE_FAILURE_ALERT_THRESHOLD) {
            this.logger.error(
              {
                sandboxId: result.sandboxId,
                consecutiveFailures: count,
                healthStatus: current,
                details: result.details,
              },
              `ALERT: Sandbox has been unhealthy for ${count} consecutive checks — investigate immediately`,
            );
          }
        } else {
          // Reset failure counter on healthy check
          if (this.consecutiveFailures.has(result.sandboxId)) {
            const prevCount = this.consecutiveFailures.get(result.sandboxId)!;
            if (prevCount > 0) {
              this.logger.info(
                {
                  sandboxId: result.sandboxId,
                  recoveredAfter: prevCount,
                },
                "Sandbox recovered — consecutive failure counter reset",
              );
            }
          }
          this.consecutiveFailures.set(result.sandboxId, 0);
        }

        // Update previous status tracker
        this.previousHealthStatus.set(result.sandboxId, current);
      }

      // Send keepalives for all checked sandboxes (prevents Kasm session expiry)
      await this.sendKeepalives(results.map((r) => r.sandboxId));

      // Enforce state consistency: downgrade any sandbox that hasn't passed
      // a health check within the last 10 minutes from 'healthy' to 'degraded'
      try {
        const downgraded = await this.sandboxService.enforceStateConsistency();
        if (downgraded > 0) {
          this.logger.info(
            { downgraded },
            "State consistency enforcement complete — stale sandboxes downgraded",
          );
        }
      } catch (err) {
        this.logger.error({ err }, "Failed to enforce state consistency");
      }
    } catch (err) {
      this.logger.error({ err }, "Failed to run scheduled health checks");
    }
  }

  private async sendKeepalives(sandboxIds: string[]) {
    let sent = 0;
    for (const id of sandboxIds) {
      try {
        await this.sandboxService.sendKeepalive(id);
        sent++;
      } catch (err) {
        this.logger.debug({ sandboxId: id, err }, "Keepalive skipped or failed");
      }
    }
    if (sent > 0) {
      this.logger.debug({ count: sent }, "Sent keepalives for checked sandboxes");
    }
  }
}
