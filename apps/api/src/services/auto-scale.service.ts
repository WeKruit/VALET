import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  UpdateAutoScalingGroupCommand,
} from "@aws-sdk/client-auto-scaling";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Database } from "@valet/db";
import type { TaskQueueService } from "../modules/tasks/task-queue.service.js";

export class AutoScaleService {
  private logger: FastifyBaseLogger;
  private taskQueueService: TaskQueueService;
  private db: Database;
  private asgClient: AutoScalingClient | null;
  private ec2Client: EC2Client | null;
  private enabled: boolean;
  private asgName: string;
  private minCapacity: number;
  private maxCapacity: number;
  private jobsPerWorker: number;

  constructor({
    logger,
    taskQueueService,
    db,
  }: {
    logger: FastifyBaseLogger;
    taskQueueService: TaskQueueService;
    db: Database;
  }) {
    this.logger = logger;
    this.taskQueueService = taskQueueService;
    this.db = db;

    this.enabled = process.env.AUTOSCALE_ASG_ENABLED === "true";
    this.asgName = process.env.AWS_ASG_NAME ?? "";
    this.minCapacity = parseInt(process.env.AUTOSCALE_ASG_MIN ?? "1", 10);
    this.maxCapacity = parseInt(process.env.AUTOSCALE_ASG_MAX ?? "10", 10);
    this.jobsPerWorker = parseInt(process.env.JOBS_PER_WORKER ?? "1", 10);

    if (this.enabled) {
      const region = process.env.AWS_REGION ?? "us-east-1";
      this.asgClient = new AutoScalingClient({ region });
      this.ec2Client = new EC2Client({ region });
    } else {
      this.asgClient = null;
      this.ec2Client = null;
    }
  }

  async evaluate(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const stats = await this.taskQueueService.getQueueStats();
      const queueDepth = stats?.queued ?? 0;

      const desired = Math.min(
        this.maxCapacity,
        Math.max(this.minCapacity, Math.ceil(queueDepth / this.jobsPerWorker)),
      );

      const current = await this.getCurrentCapacity();

      if (desired === current) {
        this.logger.info(
          { desired, current, queueDepth },
          "ASG capacity matches desired — no change",
        );
        return;
      }

      this.logger.info({ desired, current, queueDepth }, "Updating ASG desired capacity");

      await this.asgClient!.send(
        new UpdateAutoScalingGroupCommand({
          AutoScalingGroupName: this.asgName,
          DesiredCapacity: desired,
          MinSize: this.minCapacity,
          MaxSize: this.maxCapacity,
        }),
      );
    } catch (err) {
      this.logger.error({ err }, "AutoScale evaluate failed");
      // don't rethrow — let the pg-boss schedule continue
    }

    // Sync ASG instance IPs into DB (runs on every evaluate cycle)
    await this.syncAsgIps();
  }

  async getFleetStatus() {
    const stats = await this.taskQueueService.getQueueStats();
    const workerStats = await this.getWorkerStats();
    const currentCapacity = await this.getCurrentCapacity();

    return {
      enabled: this.enabled,
      asgName: this.asgName,
      currentCapacity,
      queueDepth: stats?.queued ?? 0,
      activeWorkers: workerStats.active,
      idleWorkers: workerStats.idle,
    };
  }

  async getWorkerStats(): Promise<{
    total: number;
    active: number;
    draining: number;
    offline: number;
    idle: number;
  }> {
    const statusRows = (await this.db.execute(
      sql`SELECT status, count(*)::text FROM gh_worker_registry GROUP BY status`,
    )) as Array<{ status: string; count: string }>;

    const idleRows = (await this.db.execute(
      sql`SELECT count(*)::text FROM gh_worker_registry WHERE status = 'active' AND current_job_id IS NULL`,
    )) as Array<{ count: string }>;

    let total = 0;
    let active = 0;
    let draining = 0;
    let offline = 0;

    for (const row of statusRows) {
      const count = parseInt(row.count, 10);
      total += count;
      switch (row.status) {
        case "active":
          active = count;
          break;
        case "draining":
          draining = count;
          break;
        case "offline":
          offline = count;
          break;
      }
    }

    const idle = parseInt(idleRows[0]?.count ?? "0", 10);

    return { total, active, draining, offline, idle };
  }

  /**
   * Sync ASG instance IPs into sandboxes + gh_worker_registry.
   * Called after evaluate() to keep DB in sync when ASG replaces instances.
   */
  async syncAsgIps(): Promise<void> {
    if (!this.enabled || !this.ec2Client || !this.asgName) return;

    try {
      const result = await this.ec2Client.send(
        new DescribeInstancesCommand({
          Filters: [
            { Name: "tag:aws:autoscaling:groupName", Values: [this.asgName] },
            { Name: "instance-state-name", Values: ["running"] },
          ],
        }),
      );

      const instances: Array<{ instanceId: string; publicIp: string }> = [];
      for (const reservation of result.Reservations ?? []) {
        for (const inst of reservation.Instances ?? []) {
          if (inst.InstanceId && inst.PublicIpAddress) {
            instances.push({
              instanceId: inst.InstanceId,
              publicIp: inst.PublicIpAddress,
            });
          }
        }
      }

      if (instances.length === 0) return;

      for (const { instanceId, publicIp } of instances) {
        // Update sandboxes table (match on ec2_instance_id)
        await this.db.execute(
          sql`UPDATE sandboxes SET public_ip = ${publicIp} WHERE ec2_instance_id = ${instanceId} AND (public_ip IS NULL OR public_ip != ${publicIp})`,
        );

        // Update gh_worker_registry (match on ec2_instance_id)
        await this.db.execute(
          sql`UPDATE gh_worker_registry SET ec2_ip = ${publicIp} WHERE ec2_instance_id = ${instanceId} AND (ec2_ip IS NULL OR ec2_ip != ${publicIp})`,
        );
      }

      // Warn if GHOSTHANDS_API_URL doesn't match any current instance IP
      const ghApiUrl = process.env.GHOSTHANDS_API_URL ?? "";
      const currentIps = instances.map((i) => i.publicIp);
      const urlMatchesInstance = currentIps.some((ip) => ghApiUrl.includes(ip));
      if (!urlMatchesInstance && currentIps.length > 0) {
        this.logger.warn(
          { ghApiUrl, currentIps },
          "GHOSTHANDS_API_URL does not match any running ASG instance IP — update Fly secret",
        );
      }
    } catch (err) {
      this.logger.error({ err }, "ASG IP sync failed");
    }
  }

  async getCurrentCapacity(): Promise<number> {
    if (!this.enabled || !this.asgClient) {
      return 0;
    }

    const result = await this.asgClient.send(
      new DescribeAutoScalingGroupsCommand({
        AutoScalingGroupNames: [this.asgName],
      }),
    );

    const asg = result.AutoScalingGroups?.[0];
    return asg?.DesiredCapacity ?? 0;
  }
}
