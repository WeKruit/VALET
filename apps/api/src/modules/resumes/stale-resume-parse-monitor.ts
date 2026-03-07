import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";
import type { ResumeService } from "./resume.service.js";
import type { ResumeRepository } from "./resume.repository.js";

/** How often the sweep runs (every 2 minutes). */
const SWEEP_INTERVAL_MS = 2 * 60 * 1000;
/** Resumes stuck in "parsing" longer than this are considered stale. */
const STALE_THRESHOLD_MS = 60 * 1000; // 1 minute
/** Redis lock TTL to prevent duplicate retries across instances. */
const LOCK_TTL_SECS = 90;

/**
 * Periodic monitor that recovers orphaned resume parses.
 *
 * When a Fly.io VM restarts or redeploys, in-flight fire-and-forget
 * parseResume() promises are silently killed. This monitor:
 *   1. Runs immediately on startup (onReady hook) to sweep orphans from the last crash.
 *   2. Runs every 2 minutes to catch any that slip through getById-level recovery.
 *   3. Uses a Redis NX lock per resume to prevent duplicate retries.
 */
export class StaleResumeParseMonitor {
  private resumeService: ResumeService;
  private resumeRepo: ResumeRepository;
  private redis: Redis;
  private logger: FastifyBaseLogger;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor({
    resumeService,
    resumeRepo,
    redis,
    logger,
  }: {
    resumeService: ResumeService;
    resumeRepo: ResumeRepository;
    redis: Redis;
    logger: FastifyBaseLogger;
  }) {
    this.resumeService = resumeService;
    this.resumeRepo = resumeRepo;
    this.redis = redis;
    this.logger = logger;
  }

  start() {
    if (this.intervalId) return;
    this.logger.info(
      { intervalMs: SWEEP_INTERVAL_MS, thresholdMs: STALE_THRESHOLD_MS },
      "Starting stale resume parse monitor",
    );
    // Run immediately on startup to recover from VM restart
    void this.sweep();
    this.intervalId = setInterval(() => {
      void this.sweep();
    }, SWEEP_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info("Stale resume parse monitor stopped");
    }
  }

  private async sweep(): Promise<void> {
    if (this.running) {
      this.logger.debug("Resume parse sweep already running, skipping");
      return;
    }

    this.running = true;
    try {
      const stale = await this.resumeRepo.findStaleParsingResumes(STALE_THRESHOLD_MS);
      if (stale.length === 0) return;

      this.logger.info({ count: stale.length }, "Found stale parsing resumes to recover");

      let recovered = 0;
      let skipped = 0;
      let errors = 0;

      for (const resume of stale) {
        const lockKey = `resume-parse-lock:${resume.id}`;
        try {
          const acquired = await this.redis.set(lockKey, "1", "EX", LOCK_TTL_SECS, "NX");
          if (!acquired) {
            skipped++;
            continue;
          }

          this.logger.warn(
            {
              resumeId: resume.id,
              userId: resume.userId,
              ageMs: Date.now() - new Date(resume.createdAt).getTime(),
            },
            "Recovering stale resume parse",
          );

          // Use retryParse which resets status and re-fires the background parse
          await this.resumeService.retryParse(resume.id, resume.userId);
          recovered++;
        } catch (err) {
          errors++;
          this.logger.error({ err, resumeId: resume.id }, "Failed to recover stale resume parse");
        }
      }

      this.logger.info(
        { total: stale.length, recovered, skipped, errors },
        "Stale resume parse sweep complete",
      );
    } catch (err) {
      this.logger.error({ err }, "Stale resume parse sweep failed");
    } finally {
      this.running = false;
    }
  }
}
