import type { FastifyBaseLogger } from "fastify";
import type { SandboxRepository } from "./sandbox.repository.js";
import type { SandboxService } from "./sandbox.service.js";
import type { TaskRepository } from "../tasks/task.repository.js";

const DEFAULT_CHECK_INTERVAL_MS = 30_000; // 30 seconds
const DEFAULT_COOLDOWN_MS = 120_000; // 2 minutes
const DEFAULT_MIN_INSTANCES = 1;
const DEFAULT_MAX_INSTANCES = 5;

export class AutoScaleMonitor {
  private sandboxRepo: SandboxRepository;
  private sandboxService: SandboxService;
  private taskRepo: TaskRepository;
  private logger: FastifyBaseLogger;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastScaleEventAt = 0;

  private readonly enabled: boolean;
  private readonly minInstances: number;
  private readonly maxInstances: number;
  private readonly checkIntervalMs: number;
  private readonly cooldownMs: number;

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

    this.enabled = process.env.AUTOSCALE_ENABLED === "true";
    this.minInstances =
      parseInt(process.env.AUTOSCALE_MIN_INSTANCES ?? "", 10) || DEFAULT_MIN_INSTANCES;
    this.maxInstances =
      parseInt(process.env.AUTOSCALE_MAX_INSTANCES ?? "", 10) || DEFAULT_MAX_INSTANCES;
    this.checkIntervalMs =
      parseInt(process.env.AUTOSCALE_CHECK_INTERVAL_MS ?? "", 10) || DEFAULT_CHECK_INTERVAL_MS;
    this.cooldownMs = parseInt(process.env.AUTOSCALE_COOLDOWN_MS ?? "", 10) || DEFAULT_COOLDOWN_MS;
  }

  start() {
    if (!this.enabled) {
      this.logger.info("Auto-scale monitor disabled (AUTOSCALE_ENABLED != true)");
      return;
    }

    if (this.intervalId) return;

    this.logger.info(
      {
        checkIntervalMs: this.checkIntervalMs,
        cooldownMs: this.cooldownMs,
        minInstances: this.minInstances,
        maxInstances: this.maxInstances,
      },
      "Starting auto-scale monitor",
    );

    this.intervalId = setInterval(() => {
      this.evaluate();
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info("Auto-scale monitor stopped");
    }
  }

  private async evaluate() {
    try {
      const queueDepth = await this.taskRepo.countQueued();
      const kasmSandboxes = await this.sandboxRepo.findByMachineType("kasm");

      const running = kasmSandboxes.filter((s) => s.ec2Status === "running");
      const idle = running.filter((s) => s.currentLoad === 0);
      const activeCount = kasmSandboxes.filter(
        (s) => s.ec2Status === "running" || s.ec2Status === "pending",
      ).length;

      this.logger.debug(
        { queueDepth, activeCount, running: running.length, idle: idle.length },
        "Auto-scale evaluation",
      );

      if (this.isInCooldown()) {
        this.logger.debug("Auto-scale in cooldown, skipping");
        return;
      }

      // Scale up: queue has work, no idle sessions, below max
      if (queueDepth > 0 && idle.length === 0 && activeCount < this.maxInstances) {
        await this.scaleUp();
        return;
      }

      // Scale down: queue empty, idle sessions exceed minimum
      if (queueDepth === 0 && idle.length > this.minInstances) {
        await this.scaleDown(idle);
        return;
      }
    } catch (err) {
      this.logger.error({ err }, "Failed to run auto-scale evaluation");
    }
  }

  private isInCooldown(): boolean {
    return Date.now() - this.lastScaleEventAt < this.cooldownMs;
  }

  private async scaleUp() {
    this.logger.info("Auto-scaling up: creating new Kasm sandbox");

    try {
      const sandbox = await this.sandboxService.create({
        name: `kasm-auto-${Date.now()}`,
        environment: (process.env.AUTOSCALE_ENVIRONMENT ?? "prod") as "dev" | "staging" | "prod",
        instanceId: `kasm-pending-${Date.now()}`,
        instanceType: "kasm",
        capacity: 1,
        browserEngine: "chromium",
        machineType: "kasm",
      });

      await this.sandboxService.startSandbox(sandbox.id);
      this.lastScaleEventAt = Date.now();

      this.logger.info(
        { sandboxId: sandbox.id },
        "Auto-scaled up: new Kasm sandbox created and starting",
      );
    } catch (err) {
      this.logger.error({ err }, "Failed to auto-scale up");
    }
  }

  private async scaleDown(idleSandboxes: { id: string; name: string }[]) {
    // Only stop one sandbox at a time to avoid aggressive teardown
    const target = idleSandboxes[idleSandboxes.length - 1];
    if (!target) return;

    this.logger.info(
      { sandboxId: target.id, name: target.name },
      "Auto-scaling down: stopping idle Kasm sandbox",
    );

    try {
      await this.sandboxService.stopSandbox(target.id);
      this.lastScaleEventAt = Date.now();

      this.logger.info({ sandboxId: target.id }, "Auto-scaled down: idle Kasm sandbox stopping");
    } catch (err) {
      this.logger.error({ sandboxId: target.id, err }, "Failed to auto-scale down");
    }
  }
}
