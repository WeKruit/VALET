# Sandbox Deployment: Docker, Fly Machines, and Infrastructure

> How to build, deploy, and manage the browser sandbox container across MVP and production environments.

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [MVP Dockerfile](#2-mvp-dockerfile)
3. [Production Dockerfile](#3-production-dockerfile)
4. [supervisord.conf](#4-supervisordconf)
5. [entrypoint.sh](#5-entrypointsh)
6. [Fly.io Machines API Integration](#6-flyio-machines-api-integration)
7. [fly.toml Configs](#7-flytoml-configs)
8. [Networking Deep Dive](#8-networking-deep-dive)
9. [Redis Sandbox Registry](#9-redis-sandbox-registry)
10. [Image Optimization](#10-image-optimization)
11. [Health Checks](#11-health-checks)
12. [Profile Persistence](#12-profile-persistence)
13. [Resource Planning](#13-resource-planning)
14. [Scaling Strategy](#14-scaling-strategy)
15. [Monitoring and Observability](#15-monitoring-and-observability)

---

## 1. Architecture Overview

The sandbox is a container that runs the full browser automation stack: a virtual X11 display, VNC server, websockify bridge, and AdsPower antidetect browser. The worker connects to the sandbox over CDP (Chrome DevTools Protocol) to drive automation, while the user connects via noVNC in their browser to watch or take over.

### MVP vs Production

| Aspect | MVP | Production |
|--------|-----|------------|
| Topology | Single container: worker + sandbox | Separate containers: worker and sandbox |
| Fly deployment | Modified `fly/worker.toml` | Ephemeral Fly Machines via API |
| Scaling | `fly scale count` | On-demand machine creation/destruction |
| Lifecycle | Worker process lifecycle | Per-session: create on start, destroy on end |
| Networking | localhost (same container) | Fly private network (`.internal` DNS) |

### Container Stack (both modes)

```
+-------------------------------------------------+
|  supervisord (PID 1)                            |
|  +-----------+  +---------+  +---------------+  |
|  |  Xvfb     |  | x11vnc  |  |  websockify   |  |
|  | :99       |  | :5900   |  |  :6080        |  |
|  +-----------+  +---------+  +---------------+  |
|  +-------------------------------------------+  |
|  |  AdsPower (headless, port 50325)           |  |
|  |  -> launches Chromium on DISPLAY=:99       |  |
|  +-------------------------------------------+  |
|  +-------------------------------------------+  |
|  |  health-check server (port 8089)           |  |
|  +-------------------------------------------+  |
+-------------------------------------------------+
```

---

## 2. MVP Dockerfile

Single container running the Node.js worker alongside the full sandbox stack. Used for local development and early deployment.

**File: `apps/worker/Dockerfile.mvp`**

```dockerfile
# =============================================================================
# Stage 1: Build the Node.js worker
# =============================================================================
FROM node:22-slim AS builder

WORKDIR /app

# Copy workspace manifests for dependency resolution
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/llm/package.json packages/llm/
COPY apps/worker/package.json apps/worker/

# Install pnpm and workspace dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile --filter @valet/worker...

# Copy source and build
COPY packages/ packages/
COPY apps/worker/ apps/worker/
COPY tsconfig.json ./
RUN pnpm --filter @valet/shared build \
 && pnpm --filter @valet/contracts build \
 && pnpm --filter @valet/db build \
 && pnpm --filter @valet/llm build \
 && pnpm --filter @valet/worker build

# =============================================================================
# Stage 2: Runtime with sandbox stack
# =============================================================================
FROM ubuntu:22.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive

# -- System packages: X11, VNC, websockify, window manager, supervisor --------
RUN apt-get update && apt-get install -y --no-install-recommends \
    # X11 virtual framebuffer
    xvfb \
    # VNC server
    x11vnc \
    # WebSocket-to-TCP proxy (for noVNC)
    websockify \
    # Lightweight window manager (needed for proper window decoration)
    fluxbox \
    # Process manager
    supervisor \
    # noVNC HTML client
    novnc \
    # Node.js runtime
    curl ca-certificates gnupg \
    # Fonts (AdsPower/Chromium need these)
    fonts-liberation fonts-noto-color-emoji \
    # Misc utilities
    dbus-x11 xdg-utils wget unzip procps \
 && rm -rf /var/lib/apt/lists/*

# -- Install Node.js 22 from NodeSource ---------------------------------------
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# -- Install AdsPower ----------------------------------------------------------
# Download the Linux .deb package (headless-compatible)
# Pin to a known working version for reproducibility
ARG ADSPOWER_VERSION=6.12.4
RUN wget -q "https://version.adspower.net/software/linux/AdsPower-Global-${ADSPOWER_VERSION}-x64.deb" \
      -O /tmp/adspower.deb \
 && dpkg -i /tmp/adspower.deb || apt-get install -f -y --no-install-recommends \
 && rm /tmp/adspower.deb \
 && rm -rf /var/lib/apt/lists/*

# -- Copy built worker from builder stage -------------------------------------
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/
COPY --from=builder /app/package.json ./

# -- Configuration files -------------------------------------------------------
COPY docker/sandbox/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/sandbox/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# -- Fluxbox minimal config ----------------------------------------------------
RUN mkdir -p /root/.fluxbox \
 && echo '[startup] {/usr/bin/xterm}' > /root/.fluxbox/startup \
 && echo 'session.screen0.toolbar.visible: false' > /root/.fluxbox/init

# -- Environment ---------------------------------------------------------------
ENV DISPLAY=:99
ENV VNC_PORT=5900
ENV WEBSOCKIFY_PORT=6080
ENV ADSPOWER_API_PORT=50325
ENV HEALTH_PORT=8089
ENV SCREEN_WIDTH=1920
ENV SCREEN_HEIGHT=1080
ENV SCREEN_DEPTH=24

EXPOSE 6080 50325 8089

ENTRYPOINT ["/entrypoint.sh"]
```

---

## 3. Production Dockerfile

Standalone sandbox container without the Node.js worker. The worker runs as a separate Fly app and connects to this sandbox over the private network.

**File: `docker/sandbox/Dockerfile`**

```dockerfile
# =============================================================================
# Stage 1: Download noVNC (pinned version)
# =============================================================================
FROM ubuntu:22.04 AS novnc-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget unzip ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ARG NOVNC_VERSION=1.5.0
ARG WEBSOCKIFY_VERSION=0.12.0

RUN wget -q "https://github.com/novnc/noVNC/archive/refs/tags/v${NOVNC_VERSION}.tar.gz" \
      -O /tmp/novnc.tar.gz \
 && tar -xzf /tmp/novnc.tar.gz -C /opt \
 && mv /opt/noVNC-${NOVNC_VERSION} /opt/novnc \
 && rm /tmp/novnc.tar.gz

RUN wget -q "https://github.com/novnc/websockify/archive/refs/tags/v${WEBSOCKIFY_VERSION}.tar.gz" \
      -O /tmp/websockify.tar.gz \
 && tar -xzf /tmp/websockify.tar.gz -C /opt/novnc \
 && mv /opt/novnc/websockify-${WEBSOCKIFY_VERSION} /opt/novnc/utils/websockify \
 && rm /tmp/websockify.tar.gz

# =============================================================================
# Stage 2: Runtime sandbox
# =============================================================================
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# -- System packages -----------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    # X11 virtual framebuffer
    xvfb \
    # VNC server
    x11vnc \
    # WebSocket proxy (standalone websockify for noVNC)
    python3 python3-numpy \
    # Lightweight window manager
    fluxbox \
    # Process manager
    supervisor \
    # Fonts (Chromium rendering)
    fonts-liberation fonts-noto-color-emoji fonts-noto-cjk \
    # D-Bus and X utilities
    dbus-x11 xdg-utils \
    # Network and debug
    curl wget unzip procps net-tools \
    # Certificate bundle
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# -- Install AdsPower ----------------------------------------------------------
ARG ADSPOWER_VERSION=6.12.4
RUN wget -q "https://version.adspower.net/software/linux/AdsPower-Global-${ADSPOWER_VERSION}-x64.deb" \
      -O /tmp/adspower.deb \
 && dpkg -i /tmp/adspower.deb || apt-get install -f -y --no-install-recommends \
 && rm /tmp/adspower.deb \
 && rm -rf /var/lib/apt/lists/*

# -- Copy noVNC from builder ---------------------------------------------------
COPY --from=novnc-builder /opt/novnc /opt/novnc

# Symlink vnc.html as index for cleaner URL
RUN ln -sf /opt/novnc/vnc.html /opt/novnc/index.html

# -- Configuration files -------------------------------------------------------
COPY docker/sandbox/supervisord-prod.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/sandbox/entrypoint.sh /entrypoint.sh
COPY docker/sandbox/health-check.sh /health-check.sh
RUN chmod +x /entrypoint.sh /health-check.sh

# -- Fluxbox minimal config (no toolbar, no menu) -----------------------------
RUN mkdir -p /root/.fluxbox \
 && printf '[startup]\n' > /root/.fluxbox/startup \
 && printf 'session.screen0.toolbar.visible: false\nsession.screen0.tabs.usePixmap: false\n' > /root/.fluxbox/init

# -- Environment ---------------------------------------------------------------
ENV DISPLAY=:99
ENV VNC_PORT=5900
ENV WEBSOCKIFY_PORT=6080
ENV ADSPOWER_API_PORT=50325
ENV HEALTH_PORT=8089
ENV SCREEN_WIDTH=1920
ENV SCREEN_HEIGHT=1080
ENV SCREEN_DEPTH=24

# 6080: websockify (noVNC)
# 50325: AdsPower Local API
# 8089: health check HTTP
# 5900: VNC (internal only, websockify fronts it)
EXPOSE 6080 50325 8089

ENTRYPOINT ["/entrypoint.sh"]
```

---

## 4. supervisord.conf

### MVP Configuration (worker + sandbox in one container)

**File: `docker/sandbox/supervisord.conf`**

```ini
; =============================================================================
; supervisord — MVP mode: worker + full sandbox stack
; =============================================================================
[supervisord]
nodaemon=true
logfile=/dev/null
logfile_maxbytes=0
pidfile=/var/run/supervisord.pid
user=root

; -----------------------------------------------------------------------------
; 1. Xvfb — Virtual framebuffer (must start first, everything depends on it)
; -----------------------------------------------------------------------------
[program:xvfb]
command=/usr/bin/Xvfb %(ENV_DISPLAY)s -screen 0 %(ENV_SCREEN_WIDTH)sx%(ENV_SCREEN_HEIGHT)sx%(ENV_SCREEN_DEPTH)s -ac +extension GLX +render -noreset
priority=100
autostart=true
autorestart=true
startsecs=2
startretries=3
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0

; -----------------------------------------------------------------------------
; 2. Fluxbox — Window manager (needs DISPLAY from Xvfb)
; -----------------------------------------------------------------------------
[program:fluxbox]
command=/usr/bin/fluxbox
priority=200
autostart=true
autorestart=true
startsecs=2
startretries=3
environment=DISPLAY="%(ENV_DISPLAY)s"
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0

; -----------------------------------------------------------------------------
; 3. x11vnc — VNC server (needs Xvfb running)
; -----------------------------------------------------------------------------
[program:x11vnc]
command=/usr/bin/x11vnc -display %(ENV_DISPLAY)s -rfbport %(ENV_VNC_PORT)s -shared -forever -nopw -noxdamage -xkb
priority=300
autostart=true
autorestart=true
startsecs=2
startretries=5
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0

; -----------------------------------------------------------------------------
; 4. websockify — WebSocket proxy for noVNC (needs x11vnc)
; -----------------------------------------------------------------------------
[program:websockify]
command=/usr/bin/websockify --web /usr/share/novnc %(ENV_WEBSOCKIFY_PORT)s localhost:%(ENV_VNC_PORT)s
priority=400
autostart=true
autorestart=true
startsecs=2
startretries=3
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0

; -----------------------------------------------------------------------------
; 5. AdsPower — Antidetect browser (headless mode, needs DISPLAY)
; -----------------------------------------------------------------------------
[program:adspower]
command=/opt/AdsPower/AdsPower --headless --api-key=%(ENV_ADSPOWER_API_KEY)s --api-port=%(ENV_ADSPOWER_API_PORT)s
priority=500
autostart=true
autorestart=true
startsecs=5
startretries=3
environment=DISPLAY="%(ENV_DISPLAY)s"
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0

; -----------------------------------------------------------------------------
; 6. Worker — Node.js Hatchet worker (needs AdsPower ready)
; -----------------------------------------------------------------------------
[program:worker]
command=node /app/apps/worker/dist/index.js
priority=600
autostart=true
autorestart=true
startsecs=5
startretries=3
environment=NODE_ENV="production",DISPLAY="%(ENV_DISPLAY)s"
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0
```

### Production Configuration (sandbox only, no worker)

**File: `docker/sandbox/supervisord-prod.conf`**

```ini
; =============================================================================
; supervisord — Production: standalone sandbox (no worker)
; =============================================================================
[supervisord]
nodaemon=true
logfile=/dev/null
logfile_maxbytes=0
pidfile=/var/run/supervisord.pid
user=root

; 1. Xvfb
[program:xvfb]
command=/usr/bin/Xvfb %(ENV_DISPLAY)s -screen 0 %(ENV_SCREEN_WIDTH)sx%(ENV_SCREEN_HEIGHT)sx%(ENV_SCREEN_DEPTH)s -ac +extension GLX +render -noreset
priority=100
autostart=true
autorestart=true
startsecs=2
startretries=3
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0

; 2. Fluxbox
[program:fluxbox]
command=/usr/bin/fluxbox
priority=200
autostart=true
autorestart=true
startsecs=2
environment=DISPLAY="%(ENV_DISPLAY)s"
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0

; 3. x11vnc
[program:x11vnc]
command=/usr/bin/x11vnc -display %(ENV_DISPLAY)s -rfbport %(ENV_VNC_PORT)s -shared -forever -passwd %(ENV_VNC_PASSWORD)s -noxdamage -xkb
priority=300
autostart=true
autorestart=true
startsecs=2
startretries=5
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0

; 4. websockify (fronts noVNC HTML client)
[program:websockify]
command=python3 -m websockify --web /opt/novnc %(ENV_WEBSOCKIFY_PORT)s localhost:%(ENV_VNC_PORT)s
priority=400
autostart=true
autorestart=true
startsecs=2
startretries=3
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0

; 5. AdsPower
[program:adspower]
command=/opt/AdsPower/AdsPower --headless --api-key=%(ENV_ADSPOWER_API_KEY)s --api-port=%(ENV_ADSPOWER_API_PORT)s
priority=500
autostart=true
autorestart=true
startsecs=5
startretries=3
environment=DISPLAY="%(ENV_DISPLAY)s"
stdout_logfile=/dev/fd/1
stdout_logfile_maxbytes=0
stderr_logfile=/dev/fd/2
stderr_logfile_maxbytes=0
```

### Key supervisord design decisions

- **`nodaemon=true`**: supervisord stays in the foreground as PID 1 (required by Docker).
- **`logfile=/dev/null`**: supervisord's own log is discarded; child logs go to stdout/stderr.
- **`stdout_logfile=/dev/fd/1`**: all process output lands in `docker logs` / Fly log drain.
- **`priority`**: controls startup order. Lower number = starts first. Xvfb (100) before fluxbox (200) before x11vnc (300) before websockify (400) before AdsPower (500).
- **`autorestart=true`**: crashed processes are restarted. Combined with `startretries`, this provides basic resilience.
- **Production adds VNC password**: `-passwd %(ENV_VNC_PASSWORD)s` instead of `-nopw`. Token is generated per-session in `entrypoint.sh`.

---

## 5. entrypoint.sh

**File: `docker/sandbox/entrypoint.sh`**

```bash
#!/bin/bash
set -euo pipefail

# =============================================================================
# Sandbox Container Entrypoint
# Responsibilities:
#   1. Generate VNC token (production) or use no-auth (MVP)
#   2. Validate required environment variables
#   3. Create runtime directories
#   4. Start health-check endpoint in background
#   5. Launch supervisord (blocking — becomes PID 1)
# =============================================================================

echo "[entrypoint] Starting sandbox container..."

# ---------------------------------------------------------------------------
# 1. VNC Token Generation
# ---------------------------------------------------------------------------
if [ "${SANDBOX_MODE:-mvp}" = "production" ]; then
  # Generate a random VNC password for this session
  if [ -z "${VNC_PASSWORD:-}" ]; then
    export VNC_PASSWORD=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 16)
    echo "[entrypoint] Generated VNC password: stored in VNC_PASSWORD env"
  fi
else
  # MVP mode: no VNC password (localhost only)
  export VNC_PASSWORD=""
  echo "[entrypoint] MVP mode: VNC has no password"
fi

# ---------------------------------------------------------------------------
# 2. Environment Validation
# ---------------------------------------------------------------------------
REQUIRED_VARS=(
  "ADSPOWER_API_KEY"
)

# Production-only required vars
if [ "${SANDBOX_MODE:-mvp}" = "production" ]; then
  REQUIRED_VARS+=(
    "SESSION_ID"
    "CALLBACK_URL"
  )
fi

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "[entrypoint] ERROR: Missing required environment variables: ${MISSING[*]}"
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Runtime Directories
# ---------------------------------------------------------------------------
mkdir -p /tmp/.X11-unix
mkdir -p /var/log/supervisor
mkdir -p /root/.adspower_global

# Clean up any stale X lock files
rm -f /tmp/.X99-lock

# ---------------------------------------------------------------------------
# 4. Health-Check HTTP Endpoint (background)
# ---------------------------------------------------------------------------
# Simple HTTP server that checks if all critical processes are running.
# Responds with 200 if healthy, 503 if any process is down.
(
  while true; do
    # Check that supervisord-managed processes are running
    XVFB_OK=false
    VNC_OK=false
    ADS_OK=false

    pgrep -x Xvfb > /dev/null 2>&1 && XVFB_OK=true
    pgrep -x x11vnc > /dev/null 2>&1 && VNC_OK=true

    # Check AdsPower API responds
    if curl -sf "http://localhost:${ADSPOWER_API_PORT}/status" > /dev/null 2>&1; then
      ADS_OK=true
    fi

    if $XVFB_OK && $VNC_OK && $ADS_OK; then
      RESPONSE="HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"status\":\"healthy\",\"xvfb\":true,\"vnc\":true,\"adspower\":true,\"session\":\"${SESSION_ID:-local}\"}"
    else
      RESPONSE="HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\n\r\n{\"status\":\"unhealthy\",\"xvfb\":$XVFB_OK,\"vnc\":$VNC_OK,\"adspower\":$ADS_OK}"
    fi

    echo -e "$RESPONSE" | nc -l -p "${HEALTH_PORT:-8089}" -q 1 > /dev/null 2>&1 || true
  done
) &

echo "[entrypoint] Health check listening on port ${HEALTH_PORT:-8089}"

# ---------------------------------------------------------------------------
# 5. Notify Callback (production only)
# ---------------------------------------------------------------------------
if [ "${SANDBOX_MODE:-mvp}" = "production" ] && [ -n "${CALLBACK_URL:-}" ]; then
  (
    # Wait for AdsPower to be ready before notifying
    for i in $(seq 1 30); do
      if curl -sf "http://localhost:${ADSPOWER_API_PORT}/status" > /dev/null 2>&1; then
        curl -sf -X POST "${CALLBACK_URL}" \
          -H "Content-Type: application/json" \
          -d "{\"sessionId\":\"${SESSION_ID}\",\"status\":\"ready\",\"vncPassword\":\"${VNC_PASSWORD}\",\"ports\":{\"vnc\":${VNC_PORT},\"websockify\":${WEBSOCKIFY_PORT},\"adspower\":${ADSPOWER_API_PORT}}}" \
          || echo "[entrypoint] WARNING: Failed to notify callback URL"
        break
      fi
      sleep 1
    done
  ) &
fi

# ---------------------------------------------------------------------------
# 6. Start supervisord (foreground, PID 1)
# ---------------------------------------------------------------------------
echo "[entrypoint] Launching supervisord..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
```

---

## 6. Fly.io Machines API Integration

Full TypeScript `SandboxManager` class for creating, monitoring, and destroying ephemeral sandbox machines.

**File: `apps/worker/src/sandbox/sandbox-manager.ts`**

```typescript
import { type Logger } from "pino";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MachineConfig {
  /** Fly app name for sandbox machines */
  app: string;
  /** Docker image reference (e.g. registry.fly.io/valet-sandbox:latest) */
  image: string;
  /** Fly.io region (e.g. "iad") */
  region: string;
  /** Guest VM config */
  guest: {
    cpus: number;
    cpu_kind: "shared" | "performance";
    memory_mb: number;
  };
  /** Environment variables injected into the sandbox */
  env: Record<string, string>;
}

interface FlyMachine {
  id: string;
  name: string;
  state: MachineState;
  region: string;
  instance_id: string;
  private_ip: string;
  config: {
    image: string;
    env: Record<string, string>;
    guest: {
      cpus: number;
      cpu_kind: string;
      memory_mb: number;
    };
    services: FlyService[];
  };
  created_at: string;
  updated_at: string;
}

type MachineState =
  | "created"
  | "starting"
  | "started"
  | "stopping"
  | "stopped"
  | "replacing"
  | "destroying"
  | "destroyed";

interface FlyService {
  ports: Array<{ port: number; handlers: string[] }>;
  protocol: "tcp" | "udp";
  internal_port: number;
  force_instance_key?: string;
}

interface SandboxInfo {
  machineId: string;
  privateIp: string;
  region: string;
  vncPassword: string;
  ports: {
    websockify: number;
    adspowerApi: number;
    health: number;
  };
}

interface SandboxManagerDeps {
  logger: Logger;
  flyApiToken: string;
  sandboxConfig: MachineConfig;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fly Machines REST API base URL (public endpoint) */
const FLY_API_BASE = "https://api.machines.dev/v1";

/**
 * Internal API base (used when worker runs on Fly and can reach the
 * internal API over the private WireGuard mesh — faster, no TLS overhead).
 */
const FLY_API_INTERNAL = "http://_api.internal:4280/v1";

const DEFAULT_WAIT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

// ---------------------------------------------------------------------------
// SandboxManager
// ---------------------------------------------------------------------------

export class SandboxManager {
  private readonly log: Logger;
  private readonly token: string;
  private readonly config: MachineConfig;
  private readonly apiBase: string;

  constructor(deps: SandboxManagerDeps) {
    this.log = deps.logger.child({ component: "SandboxManager" });
    this.token = deps.flyApiToken;
    this.config = deps.sandboxConfig;

    // Use internal API when running on Fly (FLY_ALLOC_ID is set on Fly VMs)
    this.apiBase = process.env["FLY_ALLOC_ID"] ? FLY_API_INTERNAL : FLY_API_BASE;
  }

  // -------------------------------------------------------------------------
  // create() — Provision a new sandbox machine
  // -------------------------------------------------------------------------

  async create(sessionId: string): Promise<SandboxInfo> {
    const vncPassword = this.generateToken(16);

    const body = {
      name: `sandbox-${sessionId}`,
      region: this.config.region,
      config: {
        image: this.config.image,
        guest: this.config.guest,
        env: {
          ...this.config.env,
          SESSION_ID: sessionId,
          SANDBOX_MODE: "production",
          VNC_PASSWORD: vncPassword,
        },
        services: [
          // websockify (noVNC access)
          {
            ports: [{ port: 6080, handlers: ["http"] }],
            protocol: "tcp" as const,
            internal_port: 6080,
          },
          // Health check
          {
            ports: [{ port: 8089, handlers: ["http"] }],
            protocol: "tcp" as const,
            internal_port: 8089,
          },
        ],
        // Auto-destroy after stop (ephemeral machine)
        auto_destroy: true,
        restart: { policy: "no" },
      },
    };

    this.log.info({ sessionId, region: this.config.region }, "Creating sandbox machine");

    const res = await this.fetch(`/apps/${this.config.app}/machines`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new SandboxError(
        `Failed to create sandbox machine: ${res.status} ${err}`,
        "CREATION_FAILED",
        { sessionId }
      );
    }

    const machine: FlyMachine = await res.json();

    this.log.info(
      { machineId: machine.id, privateIp: machine.private_ip },
      "Sandbox machine created, waiting for ready"
    );

    // Wait for the machine to reach "started" state
    await this.waitForReady(machine.id);

    return {
      machineId: machine.id,
      privateIp: machine.private_ip,
      region: machine.region,
      vncPassword,
      ports: {
        websockify: 6080,
        adspowerApi: 50325,
        health: 8089,
      },
    };
  }

  // -------------------------------------------------------------------------
  // waitForReady() — Poll until machine reaches "started" state
  // -------------------------------------------------------------------------

  async waitForReady(
    machineId: string,
    timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS
  ): Promise<void> {
    const endpoint = `/apps/${this.config.app}/machines/${machineId}/wait?state=started&timeout=${Math.floor(timeoutMs / 1000)}`;

    this.log.debug({ machineId, timeoutMs }, "Waiting for machine to start");

    const res = await this.fetch(endpoint, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs + 5_000), // extra buffer for network
    });

    if (!res.ok) {
      const err = await res.text();

      // Check if machine is stuck in a failed state
      const machine = await this.getMachine(machineId);
      if (machine?.state === "created" || machine?.state === "starting") {
        throw new SandboxError(
          `Sandbox machine timed out waiting to start: ${err}`,
          "TIMEOUT",
          { machineId, lastState: machine.state }
        );
      }

      throw new SandboxError(
        `Sandbox machine failed to start: ${machine?.state ?? "unknown"} — ${err}`,
        "START_FAILED",
        { machineId, lastState: machine?.state }
      );
    }

    this.log.info({ machineId }, "Sandbox machine is started");
  }

  // -------------------------------------------------------------------------
  // waitForHealthy() — Poll the sandbox health endpoint
  // -------------------------------------------------------------------------

  async waitForHealthy(
    privateIp: string,
    timeoutMs: number = 30_000
  ): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://[${privateIp}]:8089/`, {
          signal: AbortSignal.timeout(3_000),
        });

        if (res.ok) {
          const body = await res.json();
          if (body.status === "healthy") {
            this.log.info({ privateIp }, "Sandbox is healthy");
            return;
          }
        }
      } catch {
        // Expected while processes are still starting
      }

      await this.sleep(POLL_INTERVAL_MS);
    }

    throw new SandboxError(
      `Sandbox health check timed out after ${timeoutMs}ms`,
      "HEALTH_TIMEOUT",
      { privateIp }
    );
  }

  // -------------------------------------------------------------------------
  // destroy() — Stop and destroy a sandbox machine
  // -------------------------------------------------------------------------

  async destroy(machineId: string): Promise<void> {
    this.log.info({ machineId }, "Destroying sandbox machine");

    // First, try to stop the machine gracefully
    try {
      const stopRes = await this.fetch(
        `/apps/${this.config.app}/machines/${machineId}/stop`,
        { method: "POST" }
      );

      if (stopRes.ok) {
        // Wait for it to actually stop (5s timeout)
        try {
          await this.fetch(
            `/apps/${this.config.app}/machines/${machineId}/wait?state=stopped&timeout=5`,
            { method: "GET", signal: AbortSignal.timeout(10_000) }
          );
        } catch {
          this.log.warn({ machineId }, "Timed out waiting for graceful stop, force killing");
        }
      }
    } catch {
      this.log.warn({ machineId }, "Graceful stop failed, proceeding to force destroy");
    }

    // Force destroy the machine
    const destroyRes = await this.fetch(
      `/apps/${this.config.app}/machines/${machineId}?force=true`,
      { method: "DELETE" }
    );

    if (!destroyRes.ok && destroyRes.status !== 404) {
      const err = await destroyRes.text();
      throw new SandboxError(
        `Failed to destroy sandbox machine: ${destroyRes.status} ${err}`,
        "DESTROY_FAILED",
        { machineId }
      );
    }

    this.log.info({ machineId }, "Sandbox machine destroyed");
  }

  // -------------------------------------------------------------------------
  // getMachine() — Fetch current machine state
  // -------------------------------------------------------------------------

  async getMachine(machineId: string): Promise<FlyMachine | null> {
    const res = await this.fetch(
      `/apps/${this.config.app}/machines/${machineId}`,
      { method: "GET" }
    );

    if (res.status === 404) return null;
    if (!res.ok) return null;

    return res.json();
  }

  // -------------------------------------------------------------------------
  // listMachines() — List all sandbox machines (for cleanup)
  // -------------------------------------------------------------------------

  async listMachines(): Promise<FlyMachine[]> {
    const res = await this.fetch(
      `/apps/${this.config.app}/machines`,
      { method: "GET" }
    );

    if (!res.ok) {
      this.log.error("Failed to list sandbox machines");
      return [];
    }

    return res.json();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.apiBase}${path}`;

    return globalThis.fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  }

  private generateToken(length: number): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

type SandboxErrorCode =
  | "CREATION_FAILED"
  | "TIMEOUT"
  | "START_FAILED"
  | "HEALTH_TIMEOUT"
  | "DESTROY_FAILED";

export class SandboxError extends Error {
  constructor(
    message: string,
    public readonly code: SandboxErrorCode,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SandboxError";
  }
}
```

### Usage example (in a Hatchet workflow)

```typescript
const sandboxManager = new SandboxManager({
  logger,
  flyApiToken: process.env.FLY_API_TOKEN!,
  sandboxConfig: {
    app: "valet-sandbox-dev",
    image: "registry.fly.io/valet-sandbox-dev:latest",
    region: "iad",
    guest: { cpus: 2, cpu_kind: "shared", memory_mb: 2048 },
    env: {
      ADSPOWER_API_KEY: process.env.ADSPOWER_API_KEY!,
    },
  },
});

// In a Hatchet task:
const sandbox = await sandboxManager.create(sessionId);
await sandboxManager.waitForHealthy(sandbox.privateIp);

// Connect to AdsPower CDP
const cdpUrl = `ws://[${sandbox.privateIp}]:${sandbox.ports.adspowerApi}`;

// ... run automation ...

// Cleanup
await sandboxManager.destroy(sandbox.machineId);
```

---

## 7. fly.toml Configs

### MVP: Modified Worker (worker + sandbox)

**File: `fly/worker-mvp.toml`**

```toml
# Fly.io config for Valet Worker (MVP mode — includes sandbox stack)
# Deploy: fly deploy --config fly/worker-mvp.toml --app valet-worker-dev --remote-only

primary_region = "iad"
kill_signal = "SIGTERM"
kill_timeout = 60

[build]
  dockerfile = "apps/worker/Dockerfile.mvp"

[env]
  NODE_ENV = "production"
  SANDBOX_MODE = "mvp"
  DISPLAY = ":99"
  SCREEN_WIDTH = "1920"
  SCREEN_HEIGHT = "1080"
  SCREEN_DEPTH = "24"
  VNC_PORT = "5900"
  WEBSOCKIFY_PORT = "6080"
  ADSPOWER_API_PORT = "50325"
  HEALTH_PORT = "8089"

# websockify (noVNC) — exposed for browser access
[http_service]
  internal_port = 6080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

  [[http_service.checks]]
    interval = "30s"
    timeout = "10s"
    grace_period = "30s"
    method = "GET"
    path = "/"
    port = 8089

# AdsPower API (internal only — no public exposure)
[[services]]
  protocol = "tcp"
  internal_port = 50325

[[vm]]
  memory = "2gb"
  cpu_kind = "shared"
  cpus = 2
```

### Production: Standalone Sandbox App

**File: `fly/sandbox.toml`**

```toml
# Fly.io config for Valet Sandbox (production — ephemeral Machines)
# This app is "machines only" — no fly deploy auto-scaling.
# Machines are created/destroyed via the Machines API by the worker.
#
# Initial setup:
#   fly apps create valet-sandbox-dev --machines
#   fly auth docker
#   docker build -f docker/sandbox/Dockerfile -t registry.fly.io/valet-sandbox-dev:latest .
#   docker push registry.fly.io/valet-sandbox-dev:latest

primary_region = "iad"
kill_signal = "SIGTERM"
kill_timeout = 30

[build]
  dockerfile = "docker/sandbox/Dockerfile"

[env]
  SANDBOX_MODE = "production"
  DISPLAY = ":99"
  SCREEN_WIDTH = "1920"
  SCREEN_HEIGHT = "1080"
  SCREEN_DEPTH = "24"
  VNC_PORT = "5900"
  WEBSOCKIFY_PORT = "6080"
  ADSPOWER_API_PORT = "50325"
  HEALTH_PORT = "8089"

# websockify (noVNC) — user-facing for live view
[http_service]
  internal_port = 6080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = false
  min_machines_running = 0

  [[http_service.checks]]
    interval = "15s"
    timeout = "10s"
    grace_period = "45s"
    method = "GET"
    path = "/"
    port = 8089

[[vm]]
  memory = "2gb"
  cpu_kind = "shared"
  cpus = 2
```

### Key differences

| Setting | MVP (`worker-mvp.toml`) | Production (`sandbox.toml`) |
|---------|------------------------|-----------------------------|
| `min_machines_running` | 1 (always on) | 0 (created on demand) |
| `auto_start_machines` | true | false |
| `auto_stop_machines` | off | off |
| VM size | 2 shared CPUs, 2GB RAM | 2 shared CPUs, 2GB RAM |
| Dockerfile | `apps/worker/Dockerfile.mvp` | `docker/sandbox/Dockerfile` |
| Includes worker | Yes | No |

---

## 8. Networking Deep Dive

### Fly.io Private Networking (6PN)

All Fly apps within the same organization share a private IPv6 WireGuard mesh (6PN). This gives every Machine a unique private IPv6 address accessible from any other Machine in the org without public internet exposure.

```
Worker Machine (valet-worker-dev)
  │
  │  Private 6PN WireGuard mesh
  │  DNS: <machine-id>.vm.valet-sandbox-dev.internal
  │
  ▼
Sandbox Machine (valet-sandbox-dev)
  ├── :50325 — AdsPower Local API (CDP browser management)
  ├── :6080  — websockify (noVNC for user live view)
  ├── :5900  — x11vnc (raw VNC, internal only)
  └── :8089  — Health check HTTP
```

### DNS Resolution

- **App-level DNS**: `valet-sandbox-dev.internal` resolves to all running Machine IPs in that app.
- **Region-scoped**: `iad.valet-sandbox-dev.internal` resolves to Machines in `iad` region only.
- **Machine-specific**: Use the `private_ip` returned from the Machines API create response directly, since each sandbox is session-specific.

### CDP Connection (Worker to Sandbox)

The worker connects to AdsPower's Local API to open a browser profile and get the CDP WebSocket URL.

```
1. Worker → HTTP GET http://[<private_ip>]:50325/api/v1/browser/start?serial_number=1
   Response: { "data": { "ws": { "puppeteer": "ws://127.0.0.1:<port>/devtools/browser/<id>" } } }

2. Worker rewrites the CDP URL to use the sandbox private IP:
   ws://[<private_ip>]:<port>/devtools/browser/<id>

3. Worker → WebSocket connection to the rewritten CDP URL
   (Puppeteer/Playwright connects via this WebSocket)
```

### VNC User Access (Browser to Sandbox)

For the user to view the live browser session, the frontend connects to the noVNC endpoint:

```
User Browser
  │
  │  HTTPS (WebSocket upgrade)
  │  wss://valet-sandbox-dev.fly.dev/vnc?token=<session-token>
  │
  ▼
Fly Edge (TLS termination, routing via fly-replay)
  │
  │  fly-replay header routes to specific Machine
  │  Header: fly-replay: instance=<machine-id>
  │
  ▼
Sandbox Machine :6080 (websockify)
  │
  │  WebSocket → TCP proxy
  │
  ▼
x11vnc :5900 (VNC server)
  │
  ▼
Xvfb :99 (virtual display)
```

### fly-replay Routing

To route a user's VNC connection to the correct sandbox Machine, the API sets a `fly-replay` header:

```typescript
// In the API route handler for VNC proxy:
// GET /api/v1/sessions/:sessionId/vnc
fastify.get("/sessions/:sessionId/vnc", async (request, reply) => {
  const session = await getSession(request.params.sessionId);

  // Tell Fly's edge proxy to replay this request to the specific Machine
  reply.header("fly-replay", `instance=${session.sandboxMachineId}`);
  reply.status(200).send();
});
```

### Port Mapping Summary

| Port | Protocol | Service | Exposed To |
|------|----------|---------|------------|
| 6080 | TCP/HTTP | websockify (noVNC) | Public (via Fly edge) |
| 5900 | TCP | x11vnc (raw VNC) | Internal only (websockify fronts it) |
| 50325 | TCP/HTTP | AdsPower Local API | Internal only (worker access) |
| 8089 | TCP/HTTP | Health check | Internal (Fly health checks) |
| Dynamic | TCP/WS | CDP WebSocket | Internal only (worker access) |

---

## 9. Redis Sandbox Registry

Track active sandbox machines in Redis for session lookup, cleanup, and orphan detection.

### Schema

```typescript
// Key patterns and their values

// Primary lookup: session → sandbox info
// Key:   sandbox:session:{sessionId}
// Type:  Hash
// TTL:   SESSION_MAX_DURATION (e.g. 3600s = 1 hour)
{
  machineId: string;         // Fly Machine ID
  privateIp: string;         // 6PN IPv6 address
  region: string;            // e.g. "iad"
  vncPassword: string;       // Per-session VNC token
  status: "creating" | "ready" | "busy" | "stopping" | "destroyed";
  createdAt: string;         // ISO timestamp
  lastHeartbeat: string;     // ISO timestamp (updated by health checks)
  workerId: string;          // Which worker owns this sandbox
  userId: string;            // Which user initiated the session
  jobId: string;             // Hatchet workflow run ID
}

// Reverse lookup: machine → session
// Key:   sandbox:machine:{machineId}
// Type:  String (value = sessionId)
// TTL:   Same as session key

// Active machine set (for listing/cleanup)
// Key:   sandbox:active
// Type:  Sorted Set
// Score: createdAt timestamp (for age-based cleanup)
// Member: machineId

// Worker's active sandboxes (for worker-level cleanup on crash)
// Key:   sandbox:worker:{workerId}
// Type:  Set
// Member: sessionId
```

### TypeScript Implementation Sketch

```typescript
import { type Redis } from "ioredis";

const SESSION_MAX_TTL = 3600; // 1 hour
const KEY_PREFIX = "sandbox";

interface SandboxRegistryEntry {
  machineId: string;
  privateIp: string;
  region: string;
  vncPassword: string;
  status: "creating" | "ready" | "busy" | "stopping" | "destroyed";
  createdAt: string;
  lastHeartbeat: string;
  workerId: string;
  userId: string;
  jobId: string;
}

export class SandboxRegistry {
  constructor(private readonly redis: Redis) {}

  /** Register a new sandbox for a session */
  async register(sessionId: string, entry: SandboxRegistryEntry): Promise<void> {
    const pipeline = this.redis.pipeline();
    const now = Date.now();

    // Session → sandbox info
    pipeline.hset(`${KEY_PREFIX}:session:${sessionId}`, entry as Record<string, string>);
    pipeline.expire(`${KEY_PREFIX}:session:${sessionId}`, SESSION_MAX_TTL);

    // Machine → session reverse lookup
    pipeline.set(`${KEY_PREFIX}:machine:${entry.machineId}`, sessionId, "EX", SESSION_MAX_TTL);

    // Active set
    pipeline.zadd(`${KEY_PREFIX}:active`, now, entry.machineId);

    // Worker tracking
    pipeline.sadd(`${KEY_PREFIX}:worker:${entry.workerId}`, sessionId);

    await pipeline.exec();
  }

  /** Look up sandbox info by session ID */
  async getBySession(sessionId: string): Promise<SandboxRegistryEntry | null> {
    const data = await this.redis.hgetall(`${KEY_PREFIX}:session:${sessionId}`);
    if (!data || !data.machineId) return null;
    return data as unknown as SandboxRegistryEntry;
  }

  /** Look up session ID by machine ID */
  async getSessionByMachine(machineId: string): Promise<string | null> {
    return this.redis.get(`${KEY_PREFIX}:machine:${machineId}`);
  }

  /** Update sandbox status */
  async updateStatus(
    sessionId: string,
    status: SandboxRegistryEntry["status"]
  ): Promise<void> {
    await this.redis.hset(`${KEY_PREFIX}:session:${sessionId}`, "status", status);
  }

  /** Record a heartbeat (extends TTL) */
  async heartbeat(sessionId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    const now = new Date().toISOString();

    pipeline.hset(`${KEY_PREFIX}:session:${sessionId}`, "lastHeartbeat", now);
    pipeline.expire(`${KEY_PREFIX}:session:${sessionId}`, SESSION_MAX_TTL);

    // Also refresh machine reverse lookup TTL
    const machineId = await this.redis.hget(`${KEY_PREFIX}:session:${sessionId}`, "machineId");
    if (machineId) {
      pipeline.expire(`${KEY_PREFIX}:machine:${machineId}`, SESSION_MAX_TTL);
    }

    await pipeline.exec();
  }

  /** Remove a sandbox from the registry */
  async deregister(sessionId: string): Promise<void> {
    const entry = await this.getBySession(sessionId);
    if (!entry) return;

    const pipeline = this.redis.pipeline();

    pipeline.del(`${KEY_PREFIX}:session:${sessionId}`);
    pipeline.del(`${KEY_PREFIX}:machine:${entry.machineId}`);
    pipeline.zrem(`${KEY_PREFIX}:active`, entry.machineId);
    pipeline.srem(`${KEY_PREFIX}:worker:${entry.workerId}`, sessionId);

    await pipeline.exec();
  }

  /** Find orphaned machines (no heartbeat within threshold) */
  async findOrphans(maxAgeMs: number): Promise<string[]> {
    const cutoff = Date.now() - maxAgeMs;
    // Get machines older than cutoff from sorted set
    const orphanMachineIds = await this.redis.zrangebyscore(
      `${KEY_PREFIX}:active`,
      0,
      cutoff
    );
    return orphanMachineIds;
  }

  /** Clean up all sandboxes for a crashed worker */
  async cleanupWorker(workerId: string): Promise<string[]> {
    const sessionIds = await this.redis.smembers(`${KEY_PREFIX}:worker:${workerId}`);
    for (const sessionId of sessionIds) {
      await this.deregister(sessionId);
    }
    await this.redis.del(`${KEY_PREFIX}:worker:${workerId}`);
    return sessionIds;
  }
}
```

### Orphan Detection Cron

Run periodically (e.g., every 60 seconds) on each worker:

```typescript
async function cleanupOrphanSandboxes(
  registry: SandboxRegistry,
  sandboxManager: SandboxManager
): Promise<void> {
  const orphanMachineIds = await registry.findOrphans(SESSION_MAX_TTL * 1000);

  for (const machineId of orphanMachineIds) {
    const sessionId = await registry.getSessionByMachine(machineId);
    logger.warn({ machineId, sessionId }, "Destroying orphaned sandbox");

    try {
      await sandboxManager.destroy(machineId);
    } catch (err) {
      logger.error({ machineId, err }, "Failed to destroy orphan");
    }

    if (sessionId) {
      await registry.deregister(sessionId);
    } else {
      await registry.redis.zrem("sandbox:active", machineId);
    }
  }
}
```

---

## 10. Image Optimization

### Multi-stage Build Strategy

```
Stage 1 (novnc-builder): ~50MB   — Downloads noVNC + websockify tarballs
Stage 2 (runtime):       ~1.2GB  — Ubuntu 22.04 + Xvfb + x11vnc + fluxbox + AdsPower
```

### Size Reduction Techniques

1. **`--no-install-recommends`** on all `apt-get install` calls prevents pulling optional dependencies.

2. **Single `RUN` layer for apt** — combine all packages into one `apt-get install` to avoid multiple layers:
   ```dockerfile
   RUN apt-get update && apt-get install -y --no-install-recommends \
       pkg1 pkg2 pkg3 \
    && rm -rf /var/lib/apt/lists/*
   ```

3. **Clean apt cache in the same layer**: `rm -rf /var/lib/apt/lists/*` at the end of each `RUN` that installs packages.

4. **Separate builder stage for noVNC**: the wget/unzip/ca-certificates tools only exist in the builder, not the runtime image.

5. **Pin versions** to avoid pulling unexpected updates that bloat the image.

### Target Image Size

| Component | Approximate Size |
|-----------|-----------------|
| Ubuntu 22.04 base | ~78MB |
| Xvfb + x11vnc + fluxbox | ~120MB |
| Python3 + websockify + noVNC | ~80MB |
| Fonts | ~50MB |
| AdsPower + Chromium | ~800MB |
| Misc (supervisor, utils) | ~30MB |
| **Total** | **~1.2GB** |

AdsPower bundles its own Chromium, which is the largest single component. Without a way to share the Chromium binary, this is the floor.

### Registry Push

```bash
# One-time: authenticate with Fly registry
fly auth docker

# Build and tag
docker build -f docker/sandbox/Dockerfile \
  -t registry.fly.io/valet-sandbox-dev:latest \
  -t registry.fly.io/valet-sandbox-dev:$(git rev-parse --short HEAD) \
  .

# Push both tags
docker push registry.fly.io/valet-sandbox-dev:latest
docker push registry.fly.io/valet-sandbox-dev:$(git rev-parse --short HEAD)
```

For CI, use a GitHub Action that builds and pushes on merge to the relevant branch:

```yaml
# .github/workflows/sandbox-image.yml (excerpt)
- name: Build and push sandbox image
  run: |
    fly auth docker
    docker build -f docker/sandbox/Dockerfile \
      -t registry.fly.io/valet-sandbox-${{ env.FLY_ENV }}:${{ github.sha }} \
      -t registry.fly.io/valet-sandbox-${{ env.FLY_ENV }}:latest \
      .
    docker push registry.fly.io/valet-sandbox-${{ env.FLY_ENV }} --all-tags
```

---

## 11. Health Checks

### Layered Health Check Strategy

```
┌──────────────────────────────────────────────────────┐
│ Layer 1: In-container health (entrypoint.sh :8089)   │
│   Checks: Xvfb running, x11vnc running,             │
│   AdsPower API responding                            │
├──────────────────────────────────────────────────────┤
│ Layer 2: Fly auto-restart                            │
│   fly.toml [[http_service.checks]] polls :8089       │
│   Grace period: 45s (AdsPower takes time to start)   │
│   On failure: Fly restarts the Machine               │
├──────────────────────────────────────────────────────┤
│ Layer 3: Worker-side liveness probe                  │
│   Worker polls sandbox health every 15s              │
│   3 consecutive failures → destroy + recreate        │
├──────────────────────────────────────────────────────┤
│ Layer 4: Orphan cleanup (registry TTL)               │
│   Redis keys expire after SESSION_MAX_TTL            │
│   Periodic cron destroys machines with expired keys  │
└──────────────────────────────────────────────────────┘
```

### In-Container Health Check

The `entrypoint.sh` runs a minimal HTTP server (netcat loop) that returns 200 when all three critical processes are running:

- `Xvfb` process exists (`pgrep -x Xvfb`)
- `x11vnc` process exists (`pgrep -x x11vnc`)
- AdsPower API responds to `GET /status`

### Fly.io Health Check Config

From `fly/sandbox.toml`:
```toml
[[http_service.checks]]
  interval = "15s"     # Check every 15 seconds
  timeout = "10s"      # Fail if no response in 10s
  grace_period = "45s" # Wait 45s after start before checking
  method = "GET"
  path = "/"
  port = 8089
```

If the health check fails consecutively, Fly will restart the Machine. Combined with `auto_destroy: true`, repeated failures lead to the Machine being destroyed, which triggers the worker to create a new one.

### Worker-Side Liveness Probe

```typescript
class SandboxHealthMonitor {
  private failCount = 0;
  private readonly maxFailures = 3;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly privateIp: string,
    private readonly onUnhealthy: () => Promise<void>
  ) {}

  start(): void {
    this.interval = setInterval(() => this.check(), 15_000);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }

  private async check(): Promise<void> {
    try {
      const res = await fetch(`http://[${this.privateIp}]:8089/`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        this.failCount = 0;
        return;
      }
    } catch {
      // Network error or timeout
    }

    this.failCount++;
    if (this.failCount >= this.maxFailures) {
      await this.onUnhealthy();
    }
  }
}
```

---

## 12. Profile Persistence

### Option A: Ephemeral Profiles (MVP)

Every session gets a fresh browser profile. No state is saved between sessions.

| Pros | Cons |
|------|------|
| Simplest implementation | No session continuity |
| No storage costs | User must re-login to sites each time |
| Clean fingerprint every time | Slower start if cookies/extensions needed |
| No data leakage between sessions | Cannot resume interrupted work |

**Implementation**: AdsPower creates a new profile via `POST /api/v1/user/create`, uses it, then deletes it via `POST /api/v1/user/delete` when the session ends. The profile lives only in the container's ephemeral filesystem.

### Option B: Persistent Profiles (Production)

Save browser profiles to S3 (Supabase Storage) and restore them on session start.

| Pros | Cons |
|------|------|
| Session continuity | Added complexity (~200 LOC) |
| Cookies/logins persist | Storage costs (~50-100MB per profile) |
| Can resume interrupted work | Restore adds 5-15s to cold start |
| Fingerprint consistency | Must handle profile corruption |

**Implementation**:

```
Session Start:
1. Worker creates sandbox machine
2. Worker checks S3 for saved profile: s3://profiles/{userId}/{profileId}.tar.gz
3. If exists: download to sandbox via internal API, extract to AdsPower data dir
4. If not: AdsPower creates fresh profile

Session End:
1. Worker signals sandbox to save profile
2. Sandbox tars AdsPower profile dir, uploads to S3
3. Sandbox is destroyed (ephemeral machine)
```

### Recommendation

- **MVP**: Use ephemeral profiles. Reduces scope and avoids storage complexity.
- **v1.1**: Add persistent profiles as an opt-in feature. Users who need cross-session continuity (e.g., staying logged in to job boards) can enable it.

---

## 13. Resource Planning

### Per-Sandbox Resources

| Resource | Allocation | Notes |
|----------|-----------|-------|
| CPU | 2 shared vCPUs | Chromium needs headroom for JS execution |
| RAM | 2 GB | Chromium + AdsPower + X11 stack |
| Disk | Ephemeral (root FS) | ~2GB used by the image, ~500MB runtime |

### Cost Analysis (Fly.io Pricing)

Based on Fly.io's shared CPU pricing:

| Item | Cost |
|------|------|
| Shared CPU per vCPU | ~$0.0035/hr |
| RAM per GB | ~$0.0025/hr |
| 2 shared vCPUs + 2GB RAM | ~$0.012/hr per sandbox |
| Per minute | ~$0.0002/min |
| 10-minute session | ~$0.002 |
| 1-hour session | ~$0.012 |

### Cold Start Analysis

| Phase | Duration | Notes |
|-------|----------|-------|
| Machine creation (API call) | ~1-2s | Fly provisions Firecracker VM |
| Image pull (cached) | ~0-2s | Cached after first pull in region |
| Image pull (cold) | ~5-15s | Full 1.2GB pull from registry |
| Xvfb + x11vnc startup | ~1-2s | Fast native processes |
| AdsPower startup | ~3-5s | Java/Chromium initialization |
| Total cold start | ~5-10s (warm) / ~10-25s (cold) | |

### Capacity Estimates

| Tier | Concurrent Sandboxes | Monthly Cost (est.) |
|------|---------------------|---------------------|
| MVP | 1-3 | $5-15 |
| Growth | 10-20 | $50-150 |
| Scale | 50-100 | $250-750 |

Default Fly.io Machine limits are generous, but request an increase if planning 50+ concurrent machines per app.

---

## 14. Scaling Strategy

### Phase 1: MVP (0-3 concurrent sessions)

```
Single worker VM with integrated sandbox (Dockerfile.mvp)
├── fly scale count 1  (1 worker = 1 sandbox)
├── Sessions are sequential: one automation job at a time
└── Simple: no Machines API, no networking complexity
```

- Deploy using `fly/worker-mvp.toml`
- Worker and sandbox share the same container
- Scale horizontally: `fly scale count 3` for 3 concurrent sessions
- Cost: ~$30/month for 3 always-on workers

### Phase 2: Growth (3-20 concurrent sessions)

```
Separate worker and sandbox apps
├── valet-worker-dev: 2-3 workers (persistent, polls Hatchet)
├── valet-sandbox-dev: 0-20 machines (ephemeral, created per session)
├── Workers create sandboxes on-demand via Machines API
└── Pre-warm pool: 2-3 idle sandboxes for instant start
```

- Switch to production Dockerfiles
- Workers scale via `fly scale count`
- Sandboxes scale via Machines API (on-demand)
- Pre-warm pool: maintain 2-3 idle sandbox machines for sub-second start

### Phase 3: Scale (20-100+ concurrent sessions)

```
Auto-provisioning based on queue depth
├── valet-worker-dev: 5-10 workers (auto-scale based on Hatchet queue)
├── valet-sandbox-dev: 10-100 machines (pool-managed)
├── Warm pool: 5-10 idle sandboxes
├── Queue-aware scaling: create sandboxes ahead of demand
└── Multi-region: iad + lax + ams for global coverage
```

- Monitor Hatchet queue depth to pre-create sandboxes
- Warm pool manager: background process that maintains N idle sandboxes
- Multi-region deployment: create sandboxes in the region closest to the target website
- Consider dedicated CPU VMs for high-throughput sessions

### Pre-Warm Pool Manager

```typescript
class WarmPoolManager {
  private readonly targetSize: number;
  private readonly pool: Map<string, SandboxInfo> = new Map();

  constructor(
    private readonly sandboxManager: SandboxManager,
    private readonly registry: SandboxRegistry,
    opts: { targetSize: number }
  ) {
    this.targetSize = opts.targetSize;
  }

  /** Called periodically to maintain pool size */
  async maintain(): Promise<void> {
    const currentSize = this.pool.size;
    const deficit = this.targetSize - currentSize;

    if (deficit > 0) {
      const promises = Array.from({ length: deficit }, () =>
        this.createWarmSandbox()
      );
      await Promise.allSettled(promises);
    }
  }

  /** Acquire a sandbox from the pool (or create on-demand if empty) */
  async acquire(sessionId: string): Promise<SandboxInfo> {
    // Try to grab one from the warm pool
    const [firstKey] = this.pool.keys();
    if (firstKey) {
      const sandbox = this.pool.get(firstKey)!;
      this.pool.delete(firstKey);
      // Re-assign to this session in the registry
      await this.registry.updateStatus(firstKey, "busy");
      return sandbox;
    }

    // Pool empty — create on demand (cold start)
    return this.sandboxManager.create(sessionId);
  }

  private async createWarmSandbox(): Promise<void> {
    const warmId = `warm-${crypto.randomUUID().slice(0, 8)}`;
    const sandbox = await this.sandboxManager.create(warmId);
    this.pool.set(warmId, sandbox);
  }
}
```

---

## 15. Monitoring and Observability

### Key Metrics

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| `sandbox.create.duration_ms` | SandboxManager | p95 > 15s |
| `sandbox.create.failure_count` | SandboxManager | > 3/min |
| `sandbox.active_count` | Redis registry | > 80% of capacity |
| `sandbox.session_duration_s` | Registry timestamps | p95 > 1800s (30min) |
| `sandbox.health_check.failure_count` | Health monitor | > 5/min |
| `sandbox.orphan.cleanup_count` | Orphan cron | > 0 (warning) |
| `sandbox.warm_pool.size` | WarmPoolManager | < 1 (refill alert) |
| `sandbox.destroy.failure_count` | SandboxManager | > 0 (critical) |

### Structured Logging

All sandbox operations log structured JSON via pino:

```typescript
// Emitted on create
logger.info({
  event: "sandbox.created",
  sessionId,
  machineId: machine.id,
  region: machine.region,
  durationMs: Date.now() - startTime,
});

// Emitted on destroy
logger.info({
  event: "sandbox.destroyed",
  sessionId,
  machineId,
  sessionDurationMs: Date.now() - sessionStartTime,
  reason: "session_complete" | "health_failure" | "timeout" | "user_cancelled",
});

// Emitted on error
logger.error({
  event: "sandbox.error",
  sessionId,
  machineId,
  errorCode: error.code,
  errorMessage: error.message,
});
```

### Fly.io Dashboard Monitoring

Fly provides built-in monitoring at `https://fly.io/apps/valet-sandbox-dev/monitoring`:

- **Machine count**: Active vs stopped machines over time
- **CPU and memory usage**: Per-machine resource consumption
- **Network I/O**: Traffic between worker and sandbox
- **Logs**: Aggregated stdout/stderr from all machines

### Redis Monitoring Commands

```bash
# Count active sandboxes
redis-cli ZCARD sandbox:active

# List all active machine IDs with creation timestamps
redis-cli ZRANGEBYSCORE sandbox:active -inf +inf WITHSCORES

# Check a specific session
redis-cli HGETALL sandbox:session:<sessionId>

# Find orphans older than 1 hour
redis-cli ZRANGEBYSCORE sandbox:active 0 $(( $(date +%s) * 1000 - 3600000 ))
```

### Alerting Integration

Route pino logs through Fly's log drain to your observability platform (Axiom, Datadog, Grafana Cloud). Set up alerts on:

1. **Sandbox creation failures** (> 3 per minute) - may indicate Fly capacity issues
2. **Orphaned machines** (any orphans found) - indicates cleanup bugs
3. **Health check failures** (> 5 per minute) - indicates container instability
4. **Active count near capacity** (> 80%) - time to increase limits or optimize

---

## Appendix: File Tree

```
VALET/
├── apps/
│   └── worker/
│       ├── Dockerfile            # Standard worker (no sandbox)
│       ├── Dockerfile.mvp        # MVP: worker + sandbox in one container
│       └── src/
│           └── sandbox/
│               ├── sandbox-manager.ts    # Fly Machines API client
│               ├── sandbox-registry.ts   # Redis registry
│               ├── sandbox-health.ts     # Worker-side health monitor
│               └── warm-pool.ts          # Pre-warm pool manager
├── docker/
│   └── sandbox/
│       ├── Dockerfile             # Production: standalone sandbox
│       ├── supervisord.conf       # MVP: worker + sandbox processes
│       ├── supervisord-prod.conf  # Production: sandbox-only processes
│       ├── entrypoint.sh          # Container entrypoint
│       └── health-check.sh        # Optional: standalone health script
└── fly/
    ├── api.toml                   # Existing API config
    ├── worker.toml                # Existing worker config (no sandbox)
    ├── worker-mvp.toml            # MVP: worker + sandbox config
    ├── sandbox.toml               # Production: standalone sandbox config
    ├── web.toml                   # Existing web config
    └── hatchet.toml               # Existing Hatchet config
```
