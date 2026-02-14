import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";
import type pino from "pino";

interface HealthServerOptions {
  port: number;
  logger: pino.Logger;
  getAdspowerStatus: () => Promise<{ status: string; version?: string }>;
  getHatchetConnected: () => boolean;
  getActiveProfiles: () => number;
}

export function startHealthServer(options: HealthServerOptions) {
  const { port, logger, getAdspowerStatus, getHatchetConnected, getActiveProfiles } = options;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/health") {
      try {
        const cpus = os.cpus();
        const cpuUsage = cpus.reduce((acc, cpu) => {
          const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
          const idle = cpu.times.idle;
          return acc + ((total - idle) / total) * 100;
        }, 0) / cpus.length;

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        let adspowerInfo: { status: string; version?: string };
        try {
          adspowerInfo = await getAdspowerStatus();
        } catch {
          adspowerInfo = { status: "unreachable" };
        }

        const body = {
          status: "ok",
          uptime: os.uptime(),
          cpu: Math.round(cpuUsage * 100) / 100,
          memoryUsedMb: Math.round(usedMem / 1024 / 1024),
          memoryTotalMb: Math.round(totalMem / 1024 / 1024),
          diskUsedGb: null,
          diskTotalGb: null,
          activeProfiles: getActiveProfiles(),
          adspowerStatus: adspowerInfo.status,
          adspowerVersion: adspowerInfo.version ?? null,
          hatchetConnected: getHatchetConnected(),
          timestamp: new Date().toISOString(),
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      } catch (err) {
        logger.error({ err }, "Health check handler error");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", error: String(err) }));
      }
    } else if (req.method === "POST" && req.url === "/restart-adspower") {
      // Stub for restarting AdsPower — the actual restart logic would be
      // executed by the sandbox controller or via systemctl on the host.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Restart signal received" }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  server.listen(port, () => {
    logger.info({ port }, "Health server listening");
  });

  return server;
}
