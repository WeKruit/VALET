import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Load .env from monorepo root for local development
const envPath = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

import { Hatchet } from "@hatchet-dev/typescript-sdk";
import Redis from "ioredis";
import pino from "pino";
import { createDatabase } from "@valet/db";
import { EventLogger } from "./services/event-logger.js";
import { registerJobApplicationWorkflow } from "./workflows/job-application.js";
import { registerResumeParseWorkflow } from "./workflows/resume-parse.js";

const logger = pino({
  name: "valet-worker",
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty" }
      : undefined,
});

async function main() {
  logger.info("Starting Valet worker...");

  // Validate required Hatchet token
  if (!process.env.HATCHET_CLIENT_TOKEN) {
    logger.warn(
      "HATCHET_CLIENT_TOKEN is not set. Worker cannot connect to Hatchet. Exiting.",
    );
    process.exit(0);
  }

  // Initialize Hatchet client
  // SDK reads config from env vars: HATCHET_CLIENT_TOKEN, HATCHET_CLIENT_TLS_STRATEGY,
  // HATCHET_CLIENT_TLS_SERVER_NAME, HATCHET_CLIENT_HOST_PORT
  const hatchet = new Hatchet();

  // Initialize Redis for Pub/Sub
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    ...(redisUrl.startsWith("rediss://") && { tls: {} }),
  });
  await redis.connect();

  // Initialize database connection for event logging
  const { db, sql } = createDatabase(process.env.DATABASE_URL!);

  const eventLogger = new EventLogger(db);

  // Register workflows
  const jobApplicationWorkflow = registerJobApplicationWorkflow(hatchet, redis, eventLogger, db);
  const resumeParseWorkflow = registerResumeParseWorkflow(hatchet, redis, eventLogger, db);

  // Start the worker
  const worker = await hatchet.worker("valet-worker", {
    slots: 5,
    workflows: [jobApplicationWorkflow, resumeParseWorkflow],
  });

  await worker.start();

  logger.info("Valet worker started and listening for tasks");

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down worker...`);
    await worker.stop();
    await redis.quit();
    await sql.end();
    logger.info("Worker shut down gracefully");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal(err, "Worker failed to start");
  process.exit(1);
});
