import type { FastifyBaseLogger } from "fastify";
import type { SandboxRepository } from "./sandbox.repository.js";
import type { SandboxService } from "./sandbox.service.js";
import type { TaskRepository } from "../tasks/task.repository.js";

const AUTO_STOP_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export class AutoStopMonitor {
  private sandboxRepo: SandboxRepository;
  private sandboxService: SandboxService;
  private taskRepo: TaskRepository;
  private logger: FastifyBaseLogger;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor({
    sandboxRepo,
    sandboxService,
    taskRepo,
    logger,
  }: {
    sandboxRepo: SandboxRepository;
    sandboxService: SandboxService;
    taskRepo: TaskRepository;
    logger: FastifyBaseLogger;
  }) {
    this.sandboxRepo = sandboxRepo;
    this.sandboxService = sandboxService;
    this.taskRepo = taskRepo;
    this.logger = logger;
  }

  start() {
    if (this.intervalId) return;

    this.logger.info(
      { intervalMs: AUTO_STOP_CHECK_INTERVAL_MS },
      "Starting auto-stop monitor (ownership-based, derived task load)",
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
      // Step 1: Get VALET-owned candidates (excludes ATM/none-owned and ASG-managed workers)
      const candidates = await this.sandboxRepo.findValetAutoStopCandidates();

      if (candidates.length === 0) return;

      // Step 2: Derive load from tasks table (not currentLoad column)
      const sandboxIds = candidates.map((c) => c.id);
      const activeLoads = await this.taskRepo.countActiveBySandboxIds(sandboxIds);

      this.logger.info(
        { candidateCount: candidates.length, sandboxesWithLoad: activeLoads.size },
        "Checking idle sandboxes for auto-stop",
      );

      for (const candidate of candidates) {
        const load = activeLoads.get(candidate.id) ?? 0;

        // Step 5a: Sandbox is busy — clear idle anchor if set
        if (load > 0) {
          if (candidate.lastBecameIdleAt != null) {
            await this.sandboxRepo.setLastBecameIdleAt(candidate.id, null);
          }
          this.logger.debug(
            { sandboxId: candidate.id, name: candidate.name, load },
            "Sandbox busy, skipping auto-stop",
          );
          continue;
        }

        // Step 5b: Load is 0 but no idle anchor yet — start the timer
        if (candidate.lastBecameIdleAt == null) {
          await this.sandboxRepo.setLastBecameIdleAt(candidate.id, new Date());
          this.logger.info(
            { sandboxId: candidate.id, name: candidate.name },
            "Sandbox just became idle, starting idle timer",
          );
          continue;
        }

        // Step 5c: Load is 0 and idle anchor exists — check threshold
        const idleDuration = Date.now() - candidate.lastBecameIdleAt.getTime();
        const threshold = candidate.idleMinutesBeforeStop * 60 * 1000;

        if (idleDuration < threshold) {
          this.logger.debug(
            {
              sandboxId: candidate.id,
              idleMinutes: Math.floor(idleDuration / 60_000),
              thresholdMinutes: candidate.idleMinutesBeforeStop,
            },
            "Sandbox idle but not yet past threshold",
          );
          continue;
        }

        // Step 5d: Threshold reached — pre-stop recheck to guard against race conditions
        try {
          const recheckLoads = await this.taskRepo.countActiveBySandboxIds([candidate.id]);
          const recheckLoad = recheckLoads.get(candidate.id) ?? 0;

          if (recheckLoad > 0) {
            await this.sandboxRepo.setLastBecameIdleAt(candidate.id, null);
            this.logger.info(
              { sandboxId: candidate.id, name: candidate.name, recheckLoad },
              "Load appeared before stop, clearing idle anchor",
            );
            continue;
          }

          this.logger.info(
            {
              sandboxId: candidate.id,
              name: candidate.name,
              idleMinutes: Math.floor(idleDuration / 60_000),
            },
            "Auto-stopping idle sandbox",
          );
          await this.sandboxService.stopSandbox(candidate.id);
        } catch (err) {
          this.logger.error({ sandboxId: candidate.id, err }, "Failed to auto-stop sandbox");
        }
      }
    } catch (err) {
      this.logger.error({ err }, "Failed to run auto-stop check");
    }
  }
}
