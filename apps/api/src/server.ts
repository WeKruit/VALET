import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Load .env from monorepo root for local development
const envPath = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

import { buildApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 8000);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  const app = await buildApp();

  // Prevent unhandled socket errors (ECONNRESET, EPIPE, etc.) from crashing the process
  process.on("uncaughtException", (err) => {
    // Socket errors are expected when clients disconnect abruptly
    if ((err as NodeJS.ErrnoException).code === "ECONNRESET" ||
        (err as NodeJS.ErrnoException).code === "EPIPE" ||
        (err as NodeJS.ErrnoException).code === "ECONNABORTED") {
      app.log.warn({ err: err.message }, "Ignored socket error");
      return;
    }
    app.log.fatal(err, "Uncaught exception — shutting down");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    app.log.error({ reason }, "Unhandled promise rejection");
  });

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server listening on http://${HOST}:${PORT}`);
    app.log.info(`API docs at http://${HOST}:${PORT}/docs`);
  } catch (err) {
    app.log.fatal(err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
