import {
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";
import type { FastifyBaseLogger } from "fastify";

export type EC2InstanceStatus =
  | "pending"
  | "running"
  | "shutting-down"
  | "stopping"
  | "stopped"
  | "terminated";

export class EC2Service {
  private client: EC2Client;
  private logger: FastifyBaseLogger;

  constructor({ logger }: { logger: FastifyBaseLogger }) {
    this.logger = logger;
    this.client = new EC2Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }

  async startInstance(instanceId: string): Promise<void> {
    this.logger.info({ instanceId }, "Starting EC2 instance");
    await this.client.send(
      new StartInstancesCommand({ InstanceIds: [instanceId] }),
    );
  }

  async stopInstance(instanceId: string): Promise<void> {
    this.logger.info({ instanceId }, "Stopping EC2 instance");
    await this.client.send(
      new StopInstancesCommand({ InstanceIds: [instanceId] }),
    );
  }

  async getInstanceStatus(instanceId: string): Promise<EC2InstanceStatus> {
    const result = await this.client.send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
    );

    const instance = result.Reservations?.[0]?.Instances?.[0];
    if (!instance?.State?.Name) {
      throw new Error(`EC2 instance ${instanceId} not found`);
    }

    return instance.State.Name as EC2InstanceStatus;
  }

  async waitForStatus(
    instanceId: string,
    targetStatus: EC2InstanceStatus,
    timeoutMs = 120_000,
    pollIntervalMs = 5_000,
  ): Promise<EC2InstanceStatus> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const status = await this.getInstanceStatus(instanceId);
      this.logger.debug({ instanceId, status, targetStatus }, "Polling EC2 status");

      if (status === targetStatus) {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    const finalStatus = await this.getInstanceStatus(instanceId);
    this.logger.warn(
      { instanceId, finalStatus, targetStatus, timeoutMs },
      "Timed out waiting for EC2 status",
    );
    return finalStatus;
  }
}
