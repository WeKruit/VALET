#!/usr/bin/env node
/* eslint-disable no-undef */
// =============================================================================
// health-server.js — Lightweight health/metrics endpoint for EC2 worker
// =============================================================================
// Runs on port 8000 and aggregates system metrics + service status.
// Used by the Valet API's sandbox.service.getMetrics() method.
//
// Endpoints:
//   GET  /health  — system metrics + service status
//   POST /deploy  — trigger GhostHands image deploy (body: { image_tag })
//
// Install: Copy to /opt/valet/health-server.js
// Run:     node /opt/valet/health-server.js
// Service: systemd unit "valet-health" (see below)
// =============================================================================
const http = require("http");
const { execSync, exec: execAsync } = require("child_process");
const os = require("os");
const { URL } = require("url");

const PORT = 8000;
const GH_DIR = "/opt/ghosthands";

function exec(cmd) {
  try {
    return execSync(cmd, { timeout: 5000, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function getCpu() {
  const load1 = os.loadavg()[0];
  const cores = os.cpus().length;
  return Math.min(Math.round((load1 / cores) * 100 * 10) / 10, 100);
}

function getMemory() {
  const total = Math.round(os.totalmem() / 1024 / 1024);
  const free = Math.round(os.freemem() / 1024 / 1024);
  return { memoryTotalMb: total, memoryUsedMb: total - free };
}

function getDisk() {
  const line = exec("df -BG / | tail -1");
  if (!line) return { diskTotalGb: null, diskUsedGb: null };
  const parts = line.split(/\s+/);
  return {
    diskTotalGb: parseFloat(parts[1]) || null,
    diskUsedGb: parseFloat(parts[2]) || null,
  };
}

function getAdspowerStatus() {
  const active = exec("systemctl is-active adspower 2>/dev/null");
  if (active !== "active") return "stopped";
  const status = exec("curl -sf --connect-timeout 2 http://localhost:50325/status 2>/dev/null");
  return status ? "running" : "starting";
}

function getHatchetConnected() {
  // Check systemd first (legacy), then Docker container
  const systemd = exec("systemctl is-active valet-worker 2>/dev/null");
  if (systemd === "active") return true;
  // Check if ghosthands worker container is running via Docker
  const docker = exec(
    "docker ps --filter name=ghosthands-worker --filter status=running --format '{{.Names}}' 2>/dev/null",
  );
  return docker != null && docker.length > 0;
}

function getActiveProfiles() {
  const result = exec(
    "curl -sf --connect-timeout 2 'http://localhost:50325/api/v1/browser/active?page_size=100' 2>/dev/null",
  );
  if (!result) return 0;
  try {
    const data = JSON.parse(result);
    return data.data?.list?.length ?? 0;
  } catch {
    return 0;
  }
}

function getActiveWorkers() {
  // Count running GhostHands containers (worker + api)
  const result = exec(
    "docker ps --filter name=ghosthands --filter status=running --format '{{.Names}}' 2>/dev/null",
  );
  if (!result) return 0;
  return result.split("\n").filter(Boolean).length;
}

function getUptime() {
  return os.uptime();
}

function handleHealthRequest(_req, res) {
  const mem = getMemory();
  const disk = getDisk();

  const body = {
    status: "ok",
    cpu: getCpu(),
    ...mem,
    ...disk,
    adspowerStatus: getAdspowerStatus(),
    hatchetConnected: getHatchetConnected(),
    activeProfiles: getActiveProfiles(),
    activeWorkers: getActiveWorkers(),
    uptime: getUptime(),
  };

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

function handleDeployRequest(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    try {
      const parsed = JSON.parse(body);
      const imageTag = parsed.image_tag;

      if (!imageTag || typeof imageTag !== "string") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, message: "Missing image_tag" }));
        return;
      }

      // Validate image tag format (prevent injection)
      if (!/^[a-zA-Z0-9._\-/:]+$/.test(imageTag)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, message: "Invalid image_tag format" }));
        return;
      }

      console.log(`[Deploy] Starting deploy of image: ${imageTag}`);

      // Check if deploy script exists
      const deployScript = `${GH_DIR}/scripts/deploy.sh`;
      try {
        execSync(`test -f ${deployScript}`, { timeout: 2000 });
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, message: "deploy.sh not found" }));
        return;
      }

      // Execute deploy asynchronously (it may take a while)
      const cmd = `cd ${GH_DIR} && bash scripts/deploy.sh deploy ${imageTag}`;
      execAsync(cmd, { timeout: 120_000, encoding: "utf8" }, (err, stdout, stderr) => {
        if (err) {
          console.error(`[Deploy] Failed: ${err.message}`);
          console.error(`[Deploy] stderr: ${stderr}`);
        } else {
          console.log(`[Deploy] Success: ${stdout}`);
        }
      });

      // Respond immediately — deploy runs in background
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          message: `Deploy of ${imageTag} initiated`,
          image_tag: imageTag,
        }),
      );
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: "Invalid JSON body" }));
    }
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/health" || url.pathname === "/") {
    return handleHealthRequest(req, res);
  }

  if (url.pathname === "/deploy" && req.method === "POST") {
    return handleDeployRequest(req, res);
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server listening on port ${PORT}`);
});
