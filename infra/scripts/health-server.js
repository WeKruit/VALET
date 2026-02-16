#!/usr/bin/env node
/* eslint-disable no-undef */
// =============================================================================
// health-server.js — Lightweight health/metrics endpoint for EC2 worker
// =============================================================================
// Runs on port 8000 and aggregates system metrics + service status.
// Used by the Valet API's sandbox.service.getMetrics() method.
//
// Install: Copy to /opt/valet/health-server.js
// Run:     node /opt/valet/health-server.js
// Service: systemd unit "valet-health" (see below)
// =============================================================================
const http = require("http");
const { execSync } = require("child_process");
const os = require("os");

const PORT = 8000;

function exec(cmd) {
  try {
    return execSync(cmd, { timeout: 5000, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function getCpu() {
  // 1-minute load average as % of cores
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
  // Check if API responds
  const status = exec("curl -sf --connect-timeout 2 http://localhost:50325/status 2>/dev/null");
  return status ? "running" : "starting";
}

function getHatchetConnected() {
  // Check if the valet-worker process is running (it connects to Hatchet)
  const active = exec("systemctl is-active valet-worker 2>/dev/null");
  return active === "active";
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

function getUptime() {
  return os.uptime();
}

const server = http.createServer((_req, res) => {
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
    uptime: getUptime(),
  };

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server listening on port ${PORT}`);
});
