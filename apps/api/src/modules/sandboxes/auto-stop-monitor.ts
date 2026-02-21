import type { FastifyBaseLogger } from "fastify";
import type { SandboxRepository } from "./sandbox.repository.js";
import type { SandboxService } from "./sandbox.service.js";

const AUTO_STOP_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export class AutoStopMonitor {
  private sandboxRepo: SandboxRepository;
  private sandboxService: SandboxService;
  private logger: FastifyBaseLogger;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor({
    sandboxRepo,
    sandboxService,
    logger,
  }: {
    sandboxRepo: SandboxRepository;
    sandboxService: SandboxService;
    logger: FastifyBaseLogger;
  }) {
    this.sandboxRepo = sandboxRepo;
    this.sandboxService = sandboxService;
    this.logger = logger;
  }

  start() {
    if (this.intervalId) return;

    this.logger.info(
      { intervalMs: AUTO_STOP_CHECK_INTERVAL_MS },
      "Starting auto-stop monitor",
    );

    // Run immediately, then on interval
    this.checkAndStop();
    this.intervalId = setInterval(() => {
      this.checkAndStop();
    }, AUTO_STOP_CHECK_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info("Auto-stop monitor stopped");
    }
  }

  private async checkAndStop() {
    try {
      const candidates = await this.sandboxRepo.findAutoStopCandidates();

      if (candidates.length === 0) return;

      this.logger.info(
        { count: candidates.length },
        "Checking idle sandboxes for auto-stop",
      );

      for (const sandbox of candidates) {
        // Check if sandbox has been idle long enough
        const idleThreshold = sandbox.idleMinutesBeforeStop * 60 * 1000;
        const timeSinceUpdate = Date.now() - sandbox.updatedAt.getTime();

        if (timeSinceUpdate < idleThreshold) {
          this.logger.debug(
            {
              sandboxId: sandbox.id,
              idleMinutes: Math.floor(timeSinceUpdate / 60_000),
              threshold: sandbox.idleMinutesBeforeStop,
            },
            "Sandbox idle but not yet past threshold",
          );
          continue;
        }

        try {
          this.logger.info(
            { sandboxId: sandbox.id, name: sandbox.name },
            "Auto-stopping idle sandbox",
          );
          await this.sandboxService.stopSandbox(sandbox.id);
        } catch (err) {
          this.logger.error(
            { sandboxId: sandbox.id, err },
            "Failed to auto-stop sandbox",
          );
        }
      }
    } catch (err) {
      this.logger.error({ err }, "Failed to run auto-stop check");
    }
  }
}
