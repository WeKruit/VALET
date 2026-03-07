import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";
import type { ResumeService } from "./resume.service.js";
import type { ResumeRepository } from "./resume.repository.js";

/** How often the sweep runs (every 2 minutes). */
const SWEEP_INTERVAL_MS = 2 * 60 * 1000;
/** Resumes stuck in "parsing" longer than this are considered stale. */
const STALE_THRESHOLD_MS = 60 * 1000; // 1 minute
/** Redis key for distributed sweep lock (prevents duplicate sweeps across VMs). */
const SWEEP_LOCK_KEY = "stale-resume-sweep-lock";
/** Sweep lock TTL — must be less than SWEEP_INTERVAL_MS to avoid skipping cycles. */
const SWEEP_LOCK_TTL_SECS = 90; // 1.5 minutes

/**
 * Periodic monitor that recovers orphaned resume parses.
 *
 * When a Fly.io VM restarts or redeploys, in-flight fire-and-forget
 * parseResume() promises are silently killed. This monitor:
 *   1. Runs immediately on startup (onReady hook) to sweep orphans from the last crash.
 *   2. Runs every 2 minutes to catch any that slip through getById-level recovery.
 *   3. Checks Redis parse lock before retrying — skips resumes with active in-flight parses.
 *   4. Uses a Redis NX sweep lock so only one VM runs the sweep in multi-instance deploys.
 *   5. Passes isAutoRecovery=true to retryParse, which enforces a max attempt limit (5).
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

    // Distributed lock: only one VM runs the sweep at a time.
    // NX = set-if-not-exists, EX = TTL in seconds.
    const acquired = await this.redis.set(SWEEP_LOCK_KEY, "1", "EX", SWEEP_LOCK_TTL_SECS, "NX");
    if (!acquired) {
      this.logger.debug("Another instance is running the sweep, skipping");
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
        try {
          // Skip if a parse is already in-flight (lock held by parseResume).
          // Without this check, retried resumes with old createdAt would be
          // re-found as "stale" every sweep, creating an infinite retry loop.
          const lockKey = `resume-parse-lock:${resume.id}`;
          const lockHeld = await this.redis.exists(lockKey);
          if (lockHeld) {
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

          await this.resumeService.retryParse(resume.id, resume.userId, { isAutoRecovery: true });
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
