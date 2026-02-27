/**
 * Staging E2E test setup.
 *
 * Three-layer auth:
 *   ATM Direct  → bootstrap (wake/health, discover worker IP)
 *   VALET API   → test cases (tasks, sandboxes, monitoring)
 *   GH API      → test cases (GH health, models)
 *
 * Worker IP is discovered from ATM fleet — NOT hardcoded or env-injected.
 * This supports multi-worker fleets where IPs change on start/stop.
 *
 * Gated behind STAGING_E2E=true — skipped during normal `pnpm test`.
 */

// ── Gate ──────────────────────────────────────────────────────────────

export function isAvailable(): boolean {
  return (
    process.env.STAGING_E2E === "true" &&
    Boolean(process.env.STAGING_API_URL) &&
    Boolean(process.env.GH_SERVICE_SECRET) &&
    Boolean(process.env.ATM_BASE_URL) &&
    Boolean(process.env.ATM_DEPLOY_SECRET)
  );
}

// ── Configuration ────────────────────────────────────────────────────

export function getConfig() {
  return {
    apiUrl: process.env.STAGING_API_URL ?? "https://valet-api-stg.fly.dev",
    ghServiceSecret: process.env.GH_SERVICE_SECRET!,
    jwt: process.env.STAGING_JWT,
    atmBaseUrl: process.env.ATM_BASE_URL!,
    atmDeploySecret: process.env.ATM_DEPLOY_SECRET!,
    atmFleetId: process.env.ATM_FLEET_ID,
  };
}

// ── HTTP helpers ─────────────────────────────────────────────────────

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

interface HttpResponse {
  status: number;
  data: unknown;
  headers: Headers;
  ok: boolean;
}

async function request(
  baseUrl: string,
  path: string,
  method: Method,
  opts: RequestOptions & { authHeader?: Record<string, string> } = {},
): Promise<HttpResponse> {
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...opts.authHeader,
        ...opts.headers,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    let data: unknown;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    return { status: res.status, data, headers: res.headers, ok: res.ok };
  } finally {
    clearTimeout(timeout);
  }
}

// ── ATM Direct Client (bootstrap — independent of VALET) ────────────

function getAtmClient() {
  const baseUrl = (process.env.ATM_BASE_URL ?? "").replace(/\/$/, "");
  const secret = process.env.ATM_DEPLOY_SECRET;
  if (!baseUrl || !secret) throw new Error("ATM_BASE_URL + ATM_DEPLOY_SECRET required");

  return {
    wake: (fleetId: string) =>
      request(baseUrl, `/fleet/${fleetId}/wake`, "POST", {
        authHeader: { "X-Deploy-Secret": secret },
        timeoutMs: 135_000, // ATM wake timeout is 130s
      }),
    health: (fleetId: string) =>
      request(baseUrl, `/fleet/${fleetId}/health`, "GET", {
        authHeader: { "X-Deploy-Secret": secret },
        timeoutMs: 15_000,
      }),
    idleStatus: () =>
      request(baseUrl, "/fleet/idle-status", "GET", {
        authHeader: { "X-Deploy-Secret": secret },
        timeoutMs: 10_000,
      }),
  };
}

// ── Fleet Discovery ─────────────────────────────────────────────────

interface FleetWorker {
  fleetId: string;
  ip: string;
}

/**
 * Discovers fleet ID and worker IP from ATM.
 * Priority: ATM_FLEET_ID env → first worker from idle-status.
 */
async function discoverFleet(): Promise<FleetWorker> {
  const atm = getAtmClient();
  const res = await atm.idleStatus();
  const workers = (res.data as any)?.workers ?? [];

  // If fleet ID is pinned, find that specific worker
  if (process.env.ATM_FLEET_ID) {
    const pinned = workers.find((w: any) => w.serverId === process.env.ATM_FLEET_ID);
    if (pinned?.ip) return { fleetId: pinned.serverId, ip: pinned.ip };
    // Fleet ID set but not found in idle-status — still use it, IP comes after wake
    return { fleetId: process.env.ATM_FLEET_ID, ip: "" };
  }

  // Otherwise pick first worker
  if (workers.length > 0) {
    const w = workers[0];
    return { fleetId: w.serverId, ip: w.ip ?? "" };
  }

  throw new Error("No workers found in ATM fleet — check ATM_BASE_URL or set ATM_FLEET_ID");
}

/**
 * Resolves the worker IP from ATM idle-status after wake.
 * The wake response or subsequent idle-status will have the IP.
 */
async function resolveWorkerIp(fleetId: string): Promise<string> {
  const atm = getAtmClient();
  const res = await atm.idleStatus();
  const workers = (res.data as any)?.workers ?? [];
  const worker = workers.find((w: any) => w.serverId === fleetId);
  if (worker?.ip) return worker.ip;
  throw new Error(`Worker ${fleetId} has no IP in ATM idle-status — EC2 may not have a public IP`);
}

// ── Worker Lifecycle (singleton) ────────────────────────────────────

/** Discovered worker IP, set by ensureWorkerUp() */
let _discoveredIp: string | null = null;

/** Get the discovered worker IP. Throws if ensureWorkerUp() hasn't run. */
export function getWorkerIp(): string {
  if (!_discoveredIp) throw new Error("Call ensureWorkerUp() before getWorkerIp()");
  return _discoveredIp;
}

let _workerReady: Promise<void> | null = null;

/**
 * Ensures the EC2 worker is up and healthy, discovers its IP.
 * Call from `beforeAll` in every test file — singleton guarantees it runs once.
 *
 * Flow: discover fleet → check liveness → wake if needed → resolve IP → done.
 */
export function ensureWorkerUp(): Promise<void> {
  if (!_workerReady) _workerReady = _doEnsureWorkerUp();
  return _workerReady;
}

async function _doEnsureWorkerUp(): Promise<void> {
  const fleet = await discoverFleet();
  const atm = getAtmClient();

  // Step 1: check liveness first
  console.log(`[e2e] Checking liveness for fleet ${fleet.fleetId}...`);
  try {
    const healthRes = await atm.health(fleet.fleetId);
    const isHealthy = healthRes.ok && (healthRes.data as any)?.status === "healthy";

    if (isHealthy) {
      console.log(`[e2e] Fleet ${fleet.fleetId} already healthy — no wake needed`);
      _discoveredIp = fleet.ip || (await resolveWorkerIp(fleet.fleetId));
      console.log(`[e2e] Worker IP: ${_discoveredIp}`);
      return;
    }
  } catch {
    // Health check failed (e.g. EC2 stopped) — proceed to wake
  }

  // Step 2: wake via ATM (may take up to 130s for EC2 cold start)
  console.log(`[e2e] Fleet ${fleet.fleetId} not live — waking via ATM (this may take 1-2 min)...`);
  const wakeRes = await atm.wake(fleet.fleetId);
  if (!wakeRes.ok) {
    throw new Error(`ATM wake failed: ${wakeRes.status} ${JSON.stringify(wakeRes.data)}`);
  }

  // Wake response may contain the IP
  const wakeIp = (wakeRes.data as any)?.ip;

  // Step 3: poll health every 5s up to 120s until healthy
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const h = await atm.health(fleet.fleetId);
      if (h.ok && (h.data as any)?.status === "healthy") {
        _discoveredIp = wakeIp || (await resolveWorkerIp(fleet.fleetId));
        console.log(`[e2e] Fleet ${fleet.fleetId} healthy after wake — IP: ${_discoveredIp}`);
        return;
      }
    } catch {
      // Health endpoint may not be up yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }

  throw new Error(`Fleet ${fleet.fleetId} not healthy after 120s — HARD FAIL`);
}

// ── Clients ──────────────────────────────────────────────────────────

/**
 * Creates staging test clients.
 * GH/deploy/worker clients use the IP discovered by ensureWorkerUp().
 * Must call ensureWorkerUp() before getStagingClient().
 */
export function getStagingClient() {
  const cfg = getConfig();
  const ghIp = getWorkerIp();

  const authHeader: Record<string, string> = cfg.jwt ? { Authorization: `Bearer ${cfg.jwt}` } : {};

  const ghAuthHeader: Record<string, string> = {
    "X-GH-Service-Key": cfg.ghServiceSecret,
  };

  return {
    /** VALET API client (Fly.io staging) */
    api: {
      get: (path: string, opts?: RequestOptions) =>
        request(cfg.apiUrl, path, "GET", { ...opts, authHeader }),
      post: (path: string, opts?: RequestOptions) =>
        request(cfg.apiUrl, path, "POST", { ...opts, authHeader }),
      put: (path: string, opts?: RequestOptions) =>
        request(cfg.apiUrl, path, "PUT", { ...opts, authHeader }),
      patch: (path: string, opts?: RequestOptions) =>
        request(cfg.apiUrl, path, "PATCH", { ...opts, authHeader }),
      delete: (path: string, opts?: RequestOptions) =>
        request(cfg.apiUrl, path, "DELETE", { ...opts, authHeader }),
    },
    /** GhostHands EC2 client (discovered IP, port 3100) */
    gh: {
      get: (path: string, opts?: RequestOptions) =>
        request(`http://${ghIp}:3100`, path, "GET", {
          ...opts,
          authHeader: ghAuthHeader,
        }),
      post: (path: string, opts?: RequestOptions) =>
        request(`http://${ghIp}:3100`, path, "POST", {
          ...opts,
          authHeader: ghAuthHeader,
        }),
    },
    /** EC2 deploy server client (discovered IP, port 8000, no auth) */
    deploy: {
      get: (path: string, opts?: RequestOptions) =>
        request(`http://${ghIp}:8000`, path, "GET", opts),
    },
    /** EC2 worker client (discovered IP, port 3101, no auth) */
    worker: {
      get: (path: string, opts?: RequestOptions) =>
        request(`http://${ghIp}:3101`, path, "GET", opts),
    },
  };
}

// ── Polling helper ───────────────────────────────────────────────────

export async function waitForStatus(
  client: ReturnType<typeof getStagingClient>,
  taskId: string,
  targetStatuses: string[],
  timeoutMs = 120_000,
  pollIntervalMs = 3_000,
): Promise<HttpResponse> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await client.api.get(`/api/v1/tasks/${taskId}`);
    if (res.ok) {
      const status = (res.data as any)?.status;
      if (targetStatuses.includes(status)) return res;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(`Task ${taskId} did not reach ${targetStatuses.join("|")} within ${timeoutMs}ms`);
}
