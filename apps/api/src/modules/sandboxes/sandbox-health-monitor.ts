import type { FastifyBaseLogger } from "fastify";
import type { SandboxService } from "./sandbox.service.js";

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class SandboxHealthMonitor {
  private sandboxService: SandboxService;
  private logger: FastifyBaseLogger;
  private intervalId: ReturnType<typeof setInterval> | null = null;

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

    this.logger.info(
      { intervalMs: HEALTH_CHECK_INTERVAL_MS },
      "Starting sandbox health monitor",
    );

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

      // Only log individual unhealthy sandboxes at warn level (not error) to reduce noise
      for (const result of results) {
        if (result.healthStatus === "unhealthy") {
          this.logger.warn(
            { sandboxId: result.sandboxId, details: result.details },
            "Sandbox is unhealthy",
          );
        }
      }
    } catch (err) {
      this.logger.error({ err }, "Failed to run scheduled health checks");
    }
  }
}
