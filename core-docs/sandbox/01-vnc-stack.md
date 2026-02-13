# VNC Stack Implementation Plan

> Human-in-the-loop browser takeover via Xvfb + x11vnc + websockify + noVNC

## Table of Contents

1. [Component Deep Dive](#1-component-deep-dive)
2. [Process Stack Diagram](#2-process-stack-diagram)
3. [supervisord Configuration](#3-supervisord-configuration)
4. [entrypoint.sh](#4-entrypointsh)
5. [VNC Security Model](#5-vnc-security-model)
6. [React noVNC Component](#6-react-novnc-component)
7. [Fly.io WebSocket Routing](#7-flyio-websocket-routing)
8. [User Interaction Flows](#8-user-interaction-flows)
9. [Performance Optimization](#9-performance-optimization)
10. [Full Code Examples](#10-full-code-examples)

---

## 1. Component Deep Dive

### 1.1 Xvfb (X Virtual Framebuffer)

**What it does:** Xvfb implements the X11 display server protocol entirely in memory. It creates a virtual display that applications render to, without needing a physical monitor or GPU. All graphical operations (blitting, compositing, transformations) happen on the CPU.

**Why it's needed:** The sandbox containers run headless on Fly.io Machines -- there is no physical display. AdsPower's Chromium browser needs an X11 display to render its GUI. Xvfb provides that display in-memory, creating the framebuffer that x11vnc exposes over VNC.

**How it fits:** Xvfb is the foundation of the display stack. It starts first, creates display `:99`, and every other process in the stack references `DISPLAY=:99`. AdsPower's browser renders into this framebuffer, and x11vnc reads pixel data from it.

**Configuration:**

```bash
Xvfb :99 -screen 0 1920x1080x24 -ac -nolisten tcp
```

| Flag | Purpose |
|------|---------|
| `:99` | Display number. Avoids conflicts with `:0` if one exists. Set via `DISPLAY=:99`. |
| `-screen 0 1920x1080x24` | Screen 0 at 1920x1080 resolution, 24-bit color depth (8 bits per RGB channel). Matches typical browser viewport. |
| `-ac` | Disable access control. Required since all processes run in the same container -- no need for xauth cookies. |
| `-nolisten tcp` | Disable TCP listening. The X server only accepts local Unix socket connections, reducing attack surface. |

**Memory usage:** A single 1920x1080x24 framebuffer consumes ~6 MB (1920 * 1080 * 3 bytes). With x11vnc ncache at 10x, total shared memory usage is ~60 MB.

**Alternative resolutions:** For bandwidth-constrained scenarios, use `1280x720x24` (~2.7 MB) or `1024x768x24` (~2.3 MB). The VNC viewer can scale regardless.

### 1.2 x11vnc (VNC Server)

**What it does:** x11vnc is a VNC server that exposes an existing X11 display over the RFB (Remote Framebuffer) protocol. Unlike standard VNC servers that create their own displays, x11vnc attaches to a pre-existing display -- in our case, the Xvfb framebuffer.

**Why it's needed:** We need to stream the browser's visual output to the user's web browser. x11vnc converts the X11 framebuffer into the VNC/RFB protocol that noVNC understands. It also relays keyboard and mouse input from the VNC client back to the X11 display.

**How it fits:** x11vnc reads from Xvfb's display `:99` and listens on TCP port `5900`. websockify then bridges that TCP port to a WebSocket endpoint. x11vnc is the critical bridge between the X11 world and the network world.

**Configuration:**

```bash
x11vnc -display :99 \
  -forever \
  -nopw \
  -shared \
  -rfbport 5900 \
  -listen 127.0.0.1 \
  -ncache 10 \
  -ncache_cr \
  -xdamage \
  -noxrecord \
  -cursor most \
  -noscr \
  -nowait_bog \
  -threads \
  -noxfixes
```

| Flag | Purpose |
|------|---------|
| `-display :99` | Connect to Xvfb display `:99`. |
| `-forever` | Do not exit after the first client disconnects. Keeps the VNC server running for reconnections. |
| `-nopw` | No VNC password. Security is handled at the websockify/API layer with per-session tokens. |
| `-shared` | Allow multiple simultaneous clients (spectator + controller). |
| `-rfbport 5900` | Listen for VNC connections on port 5900. Standard VNC port. |
| `-listen 127.0.0.1` | Only accept connections from localhost. websockify is on the same container, so no external TCP access needed. |
| `-ncache 10` | Enable client-side pixel caching with 10x framebuffer size. Stores previously-seen pixel data so window switches are instant. |
| `-ncache_cr` | Enable copy-rectangle for ncache. Optimizes window move operations. |
| `-xdamage` | Use the X11 DAMAGE extension to efficiently detect changed screen regions instead of polling the entire framebuffer. |
| `-noxrecord` | Disable XRECORD extension (not needed, reduces overhead). |
| `-cursor most` | Render cursor in the framebuffer for most cases. Ensures the remote user sees the cursor. |
| `-noscr` | Disable scrolling detection heuristics. Avoids visual artifacts with modern web content. |
| `-nowait_bog` | Do not wait for slow clients. Prevents one slow spectator from slowing the session. |
| `-threads` | Use threaded mode for connection handling. Improves responsiveness with multiple clients. |
| `-noxfixes` | Disable XFIXES cursor tracking (use cursor rendering instead). |

**ncache detail:** The `-ncache N` option allocates N times the screen size below the visible area as a pixel cache. With `-ncache 10` and 1920x1080x24, x11vnc allocates a virtual framebuffer of 1920x11880 (1080 * 11), using ~60 MB. When a window is raised that was previously cached, x11vnc sends a CopyRect instead of re-encoding all pixels. This makes window switching nearly instant.

**Important:** noVNC handles ncache transparently -- it clips the displayed region to the real screen size. The `-ncache` feature uses the extended framebuffer approach where only the top `1080px` is displayed to the user; the rest is off-screen cache.

### 1.3 websockify (TCP-to-WebSocket Bridge)

**What it does:** websockify is a WebSocket-to-TCP proxy. It accepts WebSocket connections (from a browser) and forwards the data bidirectionally to a raw TCP socket (the VNC server). It can also serve static web files and handle token-based target selection.

**Why it's needed:** Browsers cannot open raw TCP sockets. The VNC RFB protocol runs over TCP on port 5900. websockify bridges this gap, converting the WebSocket frames into TCP bytes and vice versa. This is what allows noVNC (a browser-based VNC client) to connect to x11vnc.

**How it fits:** websockify listens on port `6080` (WebSocket) and forwards to `localhost:5900` (x11vnc TCP). When the user's browser opens a WebSocket to the sandbox container, websockify is the first thing it hits. It validates the session token, then proxies all VNC traffic.

**Configuration:**

```bash
websockify \
  --web /usr/share/novnc/ \
  --token-plugin TokenFile \
  --token-source /run/vnc/tokens \
  --heartbeat 30 \
  6080 \
  -- \
  --verbose
```

| Flag | Purpose |
|------|---------|
| `--web /usr/share/novnc/` | Serve noVNC static files (fallback UI, not primary -- our React app is the primary client). |
| `--token-plugin TokenFile` | Enable token-based authentication. Each connection must present a valid token. |
| `--token-source /run/vnc/tokens` | Directory containing token files. Each file maps `token: host:port`. |
| `--heartbeat 30` | Send WebSocket ping every 30 seconds to keep the connection alive through load balancers and proxies. |
| `6080` | Listen port for incoming WebSocket connections. |

**Token file format** (`/run/vnc/tokens/session.cfg`):

```
abc123def456: localhost:5900
```

The token is a per-session random string generated at sandbox creation and stored in Redis. The client passes it as a URL query parameter: `wss://host:6080/?token=abc123def456`. websockify looks up the token in the file, and if found, proxies to the specified `host:port`.

**Why TokenFile and not TokenRedis:** TokenFile is simpler and doesn't add a Redis dependency inside the container. The entrypoint.sh generates the token file at startup. Since each container has exactly one VNC session, the file has exactly one line. The API layer validates session ownership via JWT before the user ever reaches websockify.

### 1.4 noVNC (Browser VNC Client)

**What it does:** noVNC is a JavaScript/TypeScript VNC client that runs entirely in the browser. It implements the RFB protocol over WebSocket, renders the remote desktop onto an HTML5 `<canvas>` element, and captures keyboard/mouse input to send back to the server.

**Why it's needed:** This is how the user actually sees and interacts with the remote browser. noVNC renders the VNC stream in the user's browser tab without requiring any plugins, extensions, or native applications.

**How it fits:** noVNC runs inside our React SPA (`apps/web`). When the user clicks "Take Over" on a task that needs human intervention, the React app creates a noVNC connection to the sandbox's websockify endpoint. The user sees the remote browser and can interact with it directly.

**Package options:**

| Package | Version | Approach |
|---------|---------|----------|
| `@novnc/novnc` | ^1.5.0 | Raw noVNC library. Full control, but requires manual React integration. |
| `react-vnc` | ^3.2.0 | React wrapper around noVNC. Provides `<VncScreen>` component with props/callbacks. |

**Decision: Use `react-vnc` ^3.2.0.**

Rationale:
- Provides a ready-made `<VncScreen>` component with TypeScript types
- Handles RFB lifecycle (connect/disconnect/cleanup) correctly with React
- Exposes ref handle for imperative control (`connect()`, `disconnect()`, `sendCtrlAltDel()`)
- Supports all noVNC options as props (`viewOnly`, `scaleViewport`, `qualityLevel`, etc.)
- Event callbacks map cleanly to React patterns (`onConnect`, `onDisconnect`, etc.)
- Latest version (3.2.0, Nov 2025) is actively maintained

The alternative -- importing `@novnc/novnc` directly and wrapping it in a custom React component -- would require ~200 lines of boilerplate for ref management, effect cleanup, resize observation, and event wiring. `react-vnc` handles all of this.

**Key noVNC RFB API surface we use:**

```typescript
// Properties (set via react-vnc props)
rfb.viewOnly = false;          // Allow input (control mode) or block (spectator)
rfb.scaleViewport = true;      // Scale to fit container
rfb.qualityLevel = 6;          // JPEG quality 0-9 (6 = balanced)
rfb.compressionLevel = 2;      // Compression 0-9 (2 = fast, light compression)
rfb.clipViewport = false;      // Don't clip (we scale instead)
rfb.resizeSession = false;     // Don't request server resize
rfb.showDotCursor = true;      // Show cursor indicator

// Methods (via ref handle)
ref.current.connect();
ref.current.disconnect();
ref.current.sendCtrlAltDel();
ref.current.clipboardPaste(text);
ref.current.focus();

// Events (via callbacks)
onConnect(rfb)                 // Connection established
onDisconnect(rfb)              // Connection lost
onCredentialsRequired(rfb)     // Should not happen (nopw mode)
onClipboard(event)             // Server clipboard changed
```

---

## 2. Process Stack Diagram

```
                        User's Browser (apps/web)
                              |
                              | WSS (encrypted WebSocket)
                              |
                    +---------v---------+
                    |   Fly.io Proxy    |
                    |  (fly-replay)     |
                    +------|------------+
                           |
                           | fly-replay: instance=<machineId>
                           |
              +------------v--------------------------+
              |        Sandbox Container              |
              |        (Fly Machine)                  |
              |                                       |
              |  +--------+     +-----------+         |
              |  | noVNC  |     | websockify|         |
              |  | static |<----|  :6080    |         |
              |  | files  |     |  (WS)     |         |
              |  +--------+     +-----|-----+         |
              |                       |               |
              |                 TCP localhost:5900     |
              |                       |               |
              |                 +-----v-----+         |
              |                 |  x11vnc   |         |
              |                 |  :5900    |         |
              |                 +-----|-----+         |
              |                       |               |
              |                  X11 DISPLAY=:99      |
              |                       |               |
              |                 +-----v-----+         |
              |                 |   Xvfb    |         |
              |                 |   :99     |         |
              |                 +-----|-----+         |
              |                       |               |
              |              Virtual Framebuffer      |
              |              1920x1080x24             |
              |                       |               |
              |                 +-----v-----+         |
              |                 | AdsPower  |         |
              |                 | Chromium  |         |
              |                 | Browser   |         |
              |                 +-----------+         |
              |                                       |
              |  supervisord manages all processes    |
              +---------------------------------------+

Data flow (user input):
  Browser keypress/click
    -> WSS frame
    -> Fly Proxy (fly-replay to correct machine)
    -> websockify :6080 (WS -> TCP)
    -> x11vnc :5900 (RFB protocol)
    -> X11 input events on :99
    -> AdsPower Chromium receives input

Data flow (screen update):
  AdsPower renders page change
    -> Xvfb framebuffer updated
    -> x11vnc detects via XDAMAGE
    -> Encodes changed rectangles (Tight/ZRLE)
    -> TCP :5900 -> websockify :6080
    -> WSS frame -> Fly Proxy
    -> Browser noVNC renders on <canvas>
```

---

## 3. supervisord Configuration

All processes in the sandbox container are managed by supervisord, which handles startup ordering (via `priority`), automatic restarts, and log routing.

```ini
; /etc/supervisor/conf.d/supervisord.conf

[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
logfile_maxbytes=10MB
logfile_backups=1
pidfile=/var/run/supervisord.pid
loglevel=info

; ─── Xvfb ───────────────────────────────────────────────
; Priority 10: Starts first. Everything depends on the display.
[program:xvfb]
command=Xvfb :99 -screen 0 1920x1080x24 -ac -nolisten tcp
priority=10
autostart=true
autorestart=true
startsecs=2
startretries=5
stdout_logfile=/var/log/supervisor/xvfb.log
stdout_logfile_maxbytes=5MB
stderr_redirect=true
environment=HOME="/root"

; ─── x11vnc ──────────────────────────────────────────────
; Priority 20: Starts after Xvfb. Needs DISPLAY=:99.
[program:x11vnc]
command=x11vnc
  -display :99
  -forever
  -nopw
  -shared
  -rfbport 5900
  -listen 127.0.0.1
  -ncache 10
  -ncache_cr
  -xdamage
  -noxrecord
  -cursor most
  -noscr
  -nowait_bog
  -threads
  -noxfixes
priority=20
autostart=true
autorestart=true
startsecs=3
startretries=5
stdout_logfile=/var/log/supervisor/x11vnc.log
stdout_logfile_maxbytes=5MB
stderr_redirect=true
environment=DISPLAY=":99",HOME="/root"

; ─── websockify ──────────────────────────────────────────
; Priority 30: Starts after x11vnc. Bridges WS to TCP.
[program:websockify]
command=websockify
  --web /usr/share/novnc/
  --token-plugin TokenFile
  --token-source /run/vnc/tokens
  --heartbeat 30
  6080
priority=30
autostart=true
autorestart=true
startsecs=2
startretries=5
stdout_logfile=/var/log/supervisor/websockify.log
stdout_logfile_maxbytes=5MB
stderr_redirect=true

; ─── AdsPower ────────────────────────────────────────────
; Priority 50: Starts after display stack is ready.
; NOTE: AdsPower startup is handled by the sandbox controller
; via its API, not directly by supervisord. This entry is a
; placeholder for the AdsPower local API server if needed.
[program:adspower]
command=/opt/adspower/adspower --headless
priority=50
autostart=true
autorestart=true
startsecs=5
startretries=3
stdout_logfile=/var/log/supervisor/adspower.log
stdout_logfile_maxbytes=10MB
stderr_redirect=true
environment=DISPLAY=":99",HOME="/root"

; ─── Health Reporter ─────────────────────────────────────
; Priority 90: Starts last. Reports health to the API.
[program:health-reporter]
command=/opt/scripts/health-reporter.sh
priority=90
autostart=true
autorestart=true
startsecs=1
startretries=3
stdout_logfile=/var/log/supervisor/health.log
stdout_logfile_maxbytes=2MB
stderr_redirect=true
```

**Startup order** (determined by `priority`, lower = first):

1. `xvfb` (priority 10) -- display must exist before anything renders
2. `x11vnc` (priority 20) -- VNC server attaches to display
3. `websockify` (priority 30) -- WebSocket bridge to VNC
4. `adspower` (priority 50) -- browser renders into the display
5. `health-reporter` (priority 90) -- reports readiness

**Restart policies:**

- All processes set `autorestart=true` so supervisord automatically restarts them on crash
- `startsecs` gives each process time to initialize before supervisord considers it "running"
- `startretries` limits retry attempts to avoid infinite restart loops

---

## 4. entrypoint.sh

This is the container's entrypoint. It generates the VNC session token, writes the token file for websockify, starts supervisord, then enters a health check loop.

```bash
#!/usr/bin/env bash
set -euo pipefail

# ─── Environment Variables (set by Fly Machine metadata) ──────
# VNC_TOKEN        - Per-session token (generated by API, passed via machine env)
# SANDBOX_ID       - Unique sandbox identifier
# REDIS_URL        - Redis connection for health reporting
# API_CALLBACK_URL - API endpoint to report readiness

VNC_TOKEN="${VNC_TOKEN:?VNC_TOKEN is required}"
SANDBOX_ID="${SANDBOX_ID:?SANDBOX_ID is required}"

echo "[entrypoint] Starting sandbox ${SANDBOX_ID}"

# ─── 1. Create VNC Token File ────────────────────────────────
# websockify reads this to validate incoming connections.
# Format: <token>: <host>:<port>
mkdir -p /run/vnc/tokens
echo "${VNC_TOKEN}: localhost:5900" > /run/vnc/tokens/session.cfg
echo "[entrypoint] VNC token file written"

# ─── 2. Create Log Directories ───────────────────────────────
mkdir -p /var/log/supervisor

# ─── 3. Start supervisord ────────────────────────────────────
# supervisord manages Xvfb, x11vnc, websockify, and AdsPower.
echo "[entrypoint] Starting supervisord"
/usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf &
SUPERVISORD_PID=$!

# ─── 4. Wait for Display Stack ───────────────────────────────
echo "[entrypoint] Waiting for display stack..."
MAX_WAIT=30
ELAPSED=0

# Wait for Xvfb
while [ ! -e /tmp/.X11-unix/X99 ] && [ $ELAPSED -lt $MAX_WAIT ]; do
  sleep 0.5
  ELAPSED=$((ELAPSED + 1))
done

if [ ! -e /tmp/.X11-unix/X99 ]; then
  echo "[entrypoint] ERROR: Xvfb failed to start within ${MAX_WAIT}s"
  exit 1
fi
echo "[entrypoint] Xvfb is ready"

# Wait for x11vnc (check TCP port 5900)
ELAPSED=0
while ! ss -tlnp | grep -q ':5900' && [ $ELAPSED -lt $MAX_WAIT ]; do
  sleep 0.5
  ELAPSED=$((ELAPSED + 1))
done

if ! ss -tlnp | grep -q ':5900'; then
  echo "[entrypoint] ERROR: x11vnc failed to start within ${MAX_WAIT}s"
  exit 1
fi
echo "[entrypoint] x11vnc is ready"

# Wait for websockify (check TCP port 6080)
ELAPSED=0
while ! ss -tlnp | grep -q ':6080' && [ $ELAPSED -lt $MAX_WAIT ]; do
  sleep 0.5
  ELAPSED=$((ELAPSED + 1))
done

if ! ss -tlnp | grep -q ':6080'; then
  echo "[entrypoint] ERROR: websockify failed to start within ${MAX_WAIT}s"
  exit 1
fi
echo "[entrypoint] websockify is ready"

# ─── 5. Report Readiness ─────────────────────────────────────
echo "[entrypoint] All services ready. Reporting to API."

if [ -n "${API_CALLBACK_URL:-}" ]; then
  curl -sf -X POST "${API_CALLBACK_URL}/api/v1/internal/sandbox/${SANDBOX_ID}/ready" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${INTERNAL_API_KEY:-}" \
    -d "{\"vncPort\": 6080, \"sandboxId\": \"${SANDBOX_ID}\"}" \
    || echo "[entrypoint] WARNING: Failed to report readiness to API"
fi

# ─── 6. Health Check Loop ────────────────────────────────────
echo "[entrypoint] Entering health check loop"

health_check() {
  # Check Xvfb
  if [ ! -e /tmp/.X11-unix/X99 ]; then
    echo "[health] Xvfb socket missing"
    return 1
  fi

  # Check x11vnc
  if ! ss -tlnp | grep -q ':5900'; then
    echo "[health] x11vnc not listening on :5900"
    return 1
  fi

  # Check websockify
  if ! ss -tlnp | grep -q ':6080'; then
    echo "[health] websockify not listening on :6080"
    return 1
  fi

  return 0
}

while true; do
  if ! health_check; then
    echo "[health] Health check failed. supervisord should auto-restart services."
  fi
  sleep 10
done

# If supervisord exits, container should stop
wait $SUPERVISORD_PID
```

---

## 5. VNC Security Model

### 5.1 Threat Model

The VNC session exposes a live browser with a user's anti-detect profile. Unauthorized access means an attacker could:

- View sensitive form data (name, email, resume content)
- Take control of the browser in the user's anti-detect profile
- Potentially access other sites if the browser has saved sessions

### 5.2 Security Layers

```
Layer 1: JWT Authentication (API)
  |
  v
Layer 2: Session Ownership Check (API)
  |
  v
Layer 3: fly-replay Routing (Infrastructure)
  |
  v
Layer 4: Per-Session VNC Token (websockify)
  |
  v
Layer 5: Localhost-Only Binding (x11vnc)
```

**Layer 1 -- JWT Authentication:** The user must be authenticated via their JWT (stored in `localStorage` as `wk-access-token`). The API validates the JWT before doing anything.

**Layer 2 -- Session Ownership:** The API checks that the requesting user owns the task/sandbox they're trying to VNC into. A user cannot VNC into another user's sandbox. This check queries Redis where `sandbox:{sandboxId}` stores `userId`, `taskId`, `machineId`, and `vncToken`.

**Layer 3 -- fly-replay:** The API responds with a `fly-replay: instance={machineId}` header, routing the WebSocket upgrade to the correct Fly Machine. An attacker would need to know both the machine ID and the VNC token.

**Layer 4 -- VNC Token:** Each sandbox generates a unique VNC token (256-bit random, hex-encoded) at creation time. This token is:
- Stored in Redis: `sandbox:{sandboxId}:vncToken`
- Written to the container's token file: `/run/vnc/tokens/session.cfg`
- Passed to the client via the API response (only after JWT + ownership checks pass)
- Included in the WebSocket URL: `wss://host:6080/?token={vncToken}`

websockify validates the token against the token file on every new connection.

**Layer 5 -- Localhost Binding:** x11vnc binds to `127.0.0.1:5900`. Even if an attacker could reach the container's network, they cannot connect to x11vnc directly -- they must go through websockify.

### 5.3 Token Lifecycle

```
1. API creates sandbox
   -> Generates VNC_TOKEN = crypto.randomBytes(32).toString('hex')
   -> Stores in Redis: SET sandbox:{id}:vncToken {token} EX 7200

2. Fly Machine starts with VNC_TOKEN env var
   -> entrypoint.sh writes token file
   -> websockify reads token file

3. User requests VNC access
   -> GET /api/v1/vnc/:taskId
   -> API validates JWT, checks ownership, retrieves token from Redis
   -> Returns { vncUrl, token, machineId }

4. Browser connects
   -> wss://sandbox-host:6080/?token={token}
   -> websockify validates token against file
   -> Connection established

5. Session expires (TTL or explicit stop)
   -> Redis key expires (7200s default)
   -> Fly Machine is stopped/destroyed
   -> Token file no longer exists
```

### 5.4 Token Expiry

| Scenario | TTL | Action |
|----------|-----|--------|
| Normal session | 2 hours | Redis key TTL, Machine auto-stop |
| Idle session (no VNC input for 5 min) | Extended by activity | health-reporter tracks last input time |
| Explicit stop (user clicks "Resume") | Immediate | API destroys machine, DEL Redis key |
| Session recovery | Original TTL continues | Same token works for reconnection |

### 5.5 No VNC Passwords

We intentionally disable VNC-level passwords (`-nopw`). Reasons:

1. **VNC password security is weak.** VNC uses DES-encrypted passwords with a maximum of 8 characters. It provides negligible security.
2. **Passwords add UX friction.** The user would need to enter a password before seeing the remote browser. Our token-based system is transparent.
3. **Token is superior.** 256-bit random tokens validated at the websockify layer provide far stronger authentication than VNC passwords.
4. **Defense in depth is already strong.** JWT + ownership check + token + localhost binding provide four security layers before the VNC session is reached.

---

## 6. React noVNC Component

### 6.1 Package Installation

```bash
# In apps/web
pnpm add react-vnc
```

`react-vnc` v3.2.0 includes `@novnc/novnc` as a dependency and exports TypeScript types.

### 6.2 VNC Viewer Component

```tsx
// apps/web/src/features/tasks/components/vnc-viewer.tsx

import { useRef, useState, useCallback, useEffect } from "react";
import { VncScreen } from "react-vnc";
import type { VncScreenHandle } from "react-vnc";
import { Button } from "@valet/ui/components/button";
import {
  Maximize2,
  Minimize2,
  Keyboard,
  Clipboard,
  Power,
  Eye,
  MousePointer,
  Wifi,
  WifiOff,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type VncStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

interface VncViewerProps {
  /** WebSocket URL to the sandbox's websockify endpoint */
  url: string;
  /** Per-session VNC token */
  token: string;
  /** Start in view-only mode (spectator) */
  viewOnly?: boolean;
  /** Called when the user clicks "Resume Automation" */
  onResume?: () => void;
  /** Called when the VNC session ends (disconnect or error) */
  onSessionEnd?: (reason: string) => void;
  /** Optional className for the container */
  className?: string;
}

/** Idle timeout: disconnect after 5 minutes of no user input */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export function VncViewer({
  url,
  token,
  viewOnly = false,
  onResume,
  onSessionEnd,
  className,
}: VncViewerProps) {
  const vncRef = useRef<VncScreenHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const [status, setStatus] = useState<VncStatus>("idle");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(viewOnly);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Build the full WebSocket URL with token
  const wsUrl = `${url}?token=${token}`;

  // ── Idle timeout ──────────────────────────────────────────
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      vncRef.current?.disconnect();
      onSessionEnd?.("idle_timeout");
    }, IDLE_TIMEOUT_MS);
  }, [onSessionEnd]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  // ── Track user input for idle detection ───────────────────
  useEffect(() => {
    if (status !== "connected") return;

    const container = containerRef.current;
    if (!container) return;

    const handleActivity = () => resetIdleTimer();

    container.addEventListener("mousemove", handleActivity);
    container.addEventListener("keydown", handleActivity);
    container.addEventListener("mousedown", handleActivity);
    container.addEventListener("touchstart", handleActivity);

    resetIdleTimer(); // Start initial timer

    return () => {
      container.removeEventListener("mousemove", handleActivity);
      container.removeEventListener("keydown", handleActivity);
      container.removeEventListener("mousedown", handleActivity);
      container.removeEventListener("touchstart", handleActivity);
    };
  }, [status, resetIdleTimer]);

  // ── Event handlers ────────────────────────────────────────
  const handleConnect = useCallback(() => {
    setStatus("connected");
    setErrorMessage(null);
    resetIdleTimer();
  }, [resetIdleTimer]);

  const handleDisconnect = useCallback(() => {
    setStatus("disconnected");
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  }, []);

  const handleSecurityFailure = useCallback(() => {
    setStatus("error");
    setErrorMessage("Security negotiation failed. The session token may have expired.");
    onSessionEnd?.("security_failure");
  }, [onSessionEnd]);

  // ── Control bar actions ───────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  const toggleViewOnly = useCallback(() => {
    setIsViewOnly((prev) => !prev);
  }, []);

  const handleClipboardSync = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      vncRef.current?.clipboardPaste(text);
    } catch {
      // Clipboard permission denied -- ignore
    }
  }, []);

  const handleSendCtrlAltDel = useCallback(() => {
    vncRef.current?.sendCtrlAltDel();
  }, []);

  const handleDisconnectClick = useCallback(() => {
    vncRef.current?.disconnect();
    onSessionEnd?.("user_disconnect");
  }, [onSessionEnd]);

  const handleResume = useCallback(() => {
    vncRef.current?.disconnect();
    onResume?.();
  }, [onResume]);

  const handleReconnect = useCallback(() => {
    setStatus("connecting");
    setErrorMessage(null);
    vncRef.current?.connect();
  }, []);

  // ── Fullscreen change listener ────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Render ────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-lg border border-[var(--wk-border-default)] bg-black",
        isFullscreen && "fixed inset-0 z-50 rounded-none border-none",
        className
      )}
    >
      {/* ── Status Bar ───────────────────────────────────── */}
      <div className="flex items-center justify-between bg-[var(--wk-surface-raised)] px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5">
            {status === "connected" ? (
              <Wifi className="h-3.5 w-3.5 text-[var(--wk-status-success)]" />
            ) : status === "connecting" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--wk-status-warning)]" />
            ) : status === "error" ? (
              <AlertCircle className="h-3.5 w-3.5 text-[var(--wk-status-error)]" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />
            )}
            <span className="text-[var(--wk-text-secondary)]">
              {status === "connected"
                ? "Connected"
                : status === "connecting"
                  ? "Connecting..."
                  : status === "error"
                    ? "Error"
                    : "Disconnected"}
            </span>
          </div>

          {/* Mode indicator */}
          {status === "connected" && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                isViewOnly
                  ? "bg-blue-500/10 text-blue-500"
                  : "bg-green-500/10 text-green-500"
              )}
            >
              {isViewOnly ? "Spectator" : "Control"}
            </span>
          )}
        </div>

        {/* ── Control Buttons ───────────────────────────── */}
        {status === "connected" && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleViewOnly}
              title={isViewOnly ? "Switch to Control mode" : "Switch to Spectator mode"}
            >
              {isViewOnly ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <MousePointer className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowKeyboard(!showKeyboard)}
              title="Toggle keyboard"
            >
              <Keyboard className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleClipboardSync}
              title="Paste clipboard"
            >
              <Clipboard className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleSendCtrlAltDel}
              title="Send Ctrl+Alt+Del"
            >
              <Power className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* ── VNC Canvas ───────────────────────────────────── */}
      <div className="relative flex-1">
        {status === "error" && errorMessage ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <AlertCircle className="h-12 w-12 text-[var(--wk-status-error)]" />
            <div>
              <p className="text-sm font-medium text-[var(--wk-text-primary)]">
                Connection Error
              </p>
              <p className="mt-1 text-xs text-[var(--wk-text-secondary)]">
                {errorMessage}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleReconnect}>
              Retry Connection
            </Button>
          </div>
        ) : status === "disconnected" ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <WifiOff className="h-12 w-12 text-[var(--wk-text-tertiary)]" />
            <div>
              <p className="text-sm font-medium text-[var(--wk-text-primary)]">
                Session Disconnected
              </p>
              <p className="mt-1 text-xs text-[var(--wk-text-secondary)]">
                The VNC session has ended.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleReconnect}>
              Reconnect
            </Button>
          </div>
        ) : (
          <VncScreen
            ref={vncRef}
            url={wsUrl}
            viewOnly={isViewOnly}
            scaleViewport={true}
            clipViewport={false}
            resizeSession={false}
            showDotCursor={!isViewOnly}
            focusOnClick={true}
            qualityLevel={6}
            compressionLevel={2}
            background="rgb(0, 0, 0)"
            style={{ width: "100%", height: "100%" }}
            autoConnect={true}
            retryDuration={5000}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onSecurityFailure={handleSecurityFailure}
            onClipboard={(e) => {
              // Optional: sync remote clipboard to local
              if (e?.detail?.text) {
                navigator.clipboard.writeText(e.detail.text).catch(() => {});
              }
            }}
          />
        )}

        {/* Loading overlay during connection */}
        {status === "connecting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
              <p className="text-sm text-white/80">Connecting to browser...</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Action Bar ───────────────────────────────────── */}
      {status === "connected" && (
        <div className="flex items-center justify-between border-t border-[var(--wk-border-default)] bg-[var(--wk-surface-raised)] px-3 py-2">
          <p className="text-xs text-[var(--wk-text-secondary)]">
            Solve the issue in the browser, then click Resume to continue automation.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnectClick}
            >
              Disconnect
            </Button>
            <Button variant="primary" size="sm" onClick={handleResume}>
              Resume Automation
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 6.3 Integration with Task Detail Page

The VNC viewer integrates into the existing task detail page. When the WebSocket receives a `human_needed` message, the UI shows a "Take Over" button. Clicking it fetches VNC credentials from the API and opens the viewer.

```tsx
// apps/web/src/features/tasks/components/vnc-takeover-panel.tsx

import { useState, useCallback } from "react";
import { Button } from "@valet/ui/components/button";
import { Card, CardContent } from "@valet/ui/components/card";
import { Monitor, AlertTriangle } from "lucide-react";
import { VncViewer } from "./vnc-viewer";
import { api, API_BASE_URL } from "@/lib/api-client";
import { toast } from "sonner";

interface VncTakeoverPanelProps {
  taskId: string;
  reason: string;
  /** Pre-populated VNC URL from the human_needed WebSocket message */
  vncUrl?: string;
}

interface VncCredentials {
  wsUrl: string;
  token: string;
}

export function VncTakeoverPanel({
  taskId,
  reason,
  vncUrl,
}: VncTakeoverPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [credentials, setCredentials] = useState<VncCredentials | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const requestVnc = api.vnc.connect.useMutation({
    onSuccess: (data) => {
      if (data.status === 200) {
        setCredentials({
          wsUrl: data.body.wsUrl,
          token: data.body.token,
        });
        setIsOpen(true);
      }
    },
    onError: () => {
      toast.error("Failed to connect to browser session.");
    },
  });

  const handleTakeOver = useCallback(() => {
    setIsLoading(true);
    requestVnc.mutate({
      params: { taskId },
      body: {},
    });
  }, [taskId, requestVnc]);

  const handleResume = useCallback(() => {
    setIsOpen(false);
    setCredentials(null);
    // The API will be called to signal the worker to resume automation
    api.tasks.resume.mutate({
      params: { id: taskId },
      body: {},
    });
    toast.success("Automation resumed.");
  }, [taskId]);

  const handleSessionEnd = useCallback(
    (sessionEndReason: string) => {
      setIsOpen(false);
      setCredentials(null);
      if (sessionEndReason === "idle_timeout") {
        toast.info("VNC session ended due to inactivity.");
      } else if (sessionEndReason === "security_failure") {
        toast.error("Session expired. Please try again.");
      }
    },
    []
  );

  if (isOpen && credentials) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-[var(--wk-status-warning)]" />
            <h3 className="text-sm font-semibold">Browser Takeover</h3>
          </div>
        </div>
        <VncViewer
          url={credentials.wsUrl}
          token={credentials.token}
          onResume={handleResume}
          onSessionEnd={handleSessionEnd}
          className="h-[600px]"
        />
      </div>
    );
  }

  return (
    <Card className="border-[var(--wk-status-warning)] bg-[var(--wk-status-warning)]/5">
      <CardContent className="flex items-start gap-4 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--wk-status-warning)]/10">
          <AlertTriangle className="h-5 w-5 text-[var(--wk-status-warning)]" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[var(--wk-text-primary)]">
            Human Intervention Required
          </h3>
          <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
            {reason}
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-3"
            onClick={handleTakeOver}
            disabled={isLoading}
          >
            {isLoading ? "Connecting..." : "Take Over Browser"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

### 6.4 Integration Point in TaskDetail

In the existing `task-detail.tsx`, add the VNC panel when a `human_needed` message is received:

```tsx
// Inside TaskDetail component, after the TaskProgress component:

{lastMessage?.type === "human_needed" && (
  <VncTakeoverPanel
    taskId={taskId}
    reason={lastMessage.reason}
    vncUrl={lastMessage.vncUrl}
  />
)}
```

This requires extending `useTaskWebSocket` to expose `lastMessage` with proper typing:

```tsx
const { status: wsStatus, lastMessage } = useTaskWebSocket(taskId);
```

The `lastMessage` is already available from the existing `useRealtimeStore` -- it just needs to be typed as `WSMessage | null`.

---

## 7. Fly.io WebSocket Routing

### 7.1 The Problem

VNC WebSocket traffic must reach the specific Fly Machine running the user's sandbox. Fly.io's load balancer distributes requests across machines by default. We need to route VNC connections to a specific machine instance.

### 7.2 fly-replay Solution

Fly.io provides the `fly-replay` response header for dynamic request routing. When an application responds with this header, the Fly proxy replays (re-sends) the request to the specified target.

**Key behavior:** The application that returns `fly-replay` should NOT negotiate the WebSocket upgrade itself. The Fly proxy handles the upgrade after replaying the request to the target machine.

### 7.3 API Endpoint Design

```
GET /api/v1/vnc/:taskId
```

**Flow:**

1. Client sends `GET /api/v1/vnc/:taskId` to the API
2. API validates JWT, checks user owns the task
3. API looks up sandbox in Redis: `sandbox:{taskId}` -> `{ machineId, vncToken, port }`
4. API responds with `fly-replay` header to route to the sandbox machine

```typescript
// apps/api/src/routes/vnc.ts

import { FastifyInstance } from "fastify";

export async function vncRoutes(app: FastifyInstance) {
  // VNC connection endpoint -- returns fly-replay header
  // to route the WebSocket upgrade to the correct sandbox machine
  app.get<{
    Params: { taskId: string };
  }>("/api/v1/vnc/:taskId", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { taskId } = request.params;
      const userId = request.user.id;

      // 1. Verify task ownership
      const task = await app.dipiccolo.cradle.taskRepo.findById(taskId);
      if (!task || task.userId !== userId) {
        return reply.code(404).send({ error: "Task not found" });
      }

      // 2. Look up sandbox details in Redis
      const redis = app.dipiccolo.cradle.redis;
      const sandboxData = await redis.hgetall(`sandbox:${taskId}`);

      if (!sandboxData?.machineId) {
        return reply.code(404).send({ error: "No active sandbox for this task" });
      }

      const { machineId, vncToken } = sandboxData;

      // 3. Return VNC credentials to the client
      //    The client will use these to establish the WebSocket connection
      return reply.send({
        wsUrl: `wss://${request.hostname}:6080`,
        token: vncToken,
        machineId,
      });
    },
  });

  // VNC WebSocket proxy endpoint -- uses fly-replay to route to sandbox
  app.get<{
    Params: { taskId: string };
    Querystring: { token?: string };
  }>("/api/v1/vnc/:taskId/ws", {
    handler: async (request, reply) => {
      const { taskId } = request.params;

      // Look up sandbox machine ID
      const redis = app.dipiccolo.cradle.redis;
      const machineId = await redis.hget(`sandbox:${taskId}`, "machineId");

      if (!machineId) {
        return reply.code(404).send({ error: "No active sandbox" });
      }

      // Return fly-replay header -- Fly proxy will replay this
      // request (including the WebSocket upgrade) to the sandbox machine
      reply.header("fly-replay", `instance=${machineId}`);
      return reply.code(307).send();
    },
  });
}
```

### 7.4 Alternative: Direct Machine Connection

For cases where `fly-replay` is insufficient (e.g., the proxy adds latency or the machine isn't in the app's process group), we can use Fly's private networking:

```
wss://{machineId}.vm.{app-name}.internal:6080/?token={vncToken}
```

However, `.internal` addresses are only reachable from within the Fly network. For browser access, `fly-replay` is the correct approach.

### 7.5 Two-Phase Connection Pattern

The client uses a two-phase approach:

**Phase 1: Credential exchange (REST)**
```
GET /api/v1/vnc/:taskId
Authorization: Bearer <jwt>

Response:
{
  "wsUrl": "wss://valet-worker-dev.fly.dev/api/v1/vnc/{taskId}/ws",
  "token": "abc123...",
  "machineId": "d5683606c77108"
}
```

**Phase 2: WebSocket connection (fly-replay routed)**
```
GET /api/v1/vnc/:taskId/ws?token=abc123...
Connection: Upgrade
Upgrade: websocket

-> API responds with: fly-replay: instance=d5683606c77108
-> Fly proxy replays to sandbox machine
-> Sandbox's websockify accepts the WS upgrade
-> websockify validates token
-> VNC stream begins
```

### 7.6 Fallback: Embedded Machine ID

If `fly-replay` fails (e.g., machine is unreachable), the API returns an error and the React app shows a "Session unavailable" message with a retry button. The retry re-fetches credentials, which will fail fast if the machine is truly dead (Redis TTL expired or machine stopped).

```typescript
// In VncTakeoverPanel, handle fly-replay failure:
onError: () => {
  toast.error("Browser session is unavailable. The sandbox may have expired.");
  // Invalidate task query to refresh status
  queryClient.invalidateQueries({ queryKey: ["tasks", taskId] });
}
```

---

## 8. User Interaction Flows

### 8.1 CAPTCHA / Human Intervention Flow

```
Timeline:

  1. Automation running
     Worker detects CAPTCHA
     |
  2. Worker sends WebSocket message:
     { type: "human_needed", taskId, reason: "CAPTCHA detected on login page" }
     |
  3. React app receives message
     VncTakeoverPanel appears with warning card:
     "Human Intervention Required: CAPTCHA detected on login page"
     [Take Over Browser] button
     |
  4. User clicks [Take Over Browser]
     -> GET /api/v1/vnc/:taskId (fetch credentials)
     -> VncViewer opens, status: "Connecting..."
     -> WebSocket to sandbox via fly-replay
     -> VNC stream renders in canvas
     |
  5. User sees the browser with CAPTCHA
     Mode: "Control" (full keyboard + mouse)
     User solves CAPTCHA, clicks submit
     |
  6. User clicks [Resume Automation]
     -> VNC disconnects
     -> POST /api/v1/tasks/:taskId/resume
     -> Worker receives resume signal
     -> Automation continues from where it left off
     |
  7. VncTakeoverPanel closes
     TaskProgress shows next step (e.g., "Filling")
```

### 8.2 Spectator Mode vs Control Mode

| Aspect | Spectator | Control |
|--------|-----------|---------|
| `viewOnly` | `true` | `false` |
| Mouse/keyboard | Blocked | Forwarded to remote |
| Cursor | Hidden (no dot cursor) | Shown (dot cursor) |
| Use case | Watching automation progress | Solving CAPTCHAs, manual input |
| Toggle | Click eye icon in control bar | Click pointer icon in control bar |

**Default mode:** The VNC viewer opens in **Control** mode when triggered by `human_needed`. The user can switch to Spectator mode via the control bar to watch without accidentally interfering.

**Future: Spectator-only access.** For monitoring automation in real-time (without intervention), the task detail page could offer a "Watch Live" button that opens VncViewer with `viewOnly={true}` and hides the "Resume" button.

### 8.3 Idle Timeout

```
User connects via VNC
  -> Idle timer starts (5 minutes)

User moves mouse / presses key
  -> Idle timer resets

No input for 5 minutes
  -> VNC disconnects automatically
  -> Toast: "VNC session ended due to inactivity"
  -> VncTakeoverPanel returns to "Take Over" state
  -> User can reconnect by clicking [Take Over Browser] again
```

The 5-minute timeout prevents abandoned VNC sessions from keeping sandbox machines running. The timeout is client-side (simpler to implement). The health-reporter in the sandbox also tracks activity and reports to the API, which can force-stop truly abandoned sandboxes after a longer server-side timeout (e.g., 30 minutes).

### 8.4 Session Recovery (Reconnection)

```
WebSocket drops (network blip, Fly proxy restart)
  -> noVNC fires onDisconnect
  -> VncViewer shows "Disconnected" state
  -> react-vnc retryDuration=5000 triggers auto-reconnect
  -> If reconnect succeeds:
     -> Back to "Connected" state, canvas resumes
  -> If reconnect fails after retries:
     -> Show "Reconnect" button
     -> User clicks -> fresh credential exchange + connection
```

The VNC token remains valid (stored in Redis with 2-hour TTL), so reconnections use the same token. The sandbox machine and its x11vnc process are still running -- only the WebSocket transport was interrupted.

### 8.5 Session End Scenarios

| Scenario | Trigger | User Experience |
|----------|---------|-----------------|
| User resumes | "Resume Automation" button | VNC closes, automation continues |
| User disconnects | "Disconnect" button | VNC closes, panel returns to "Take Over" state |
| Idle timeout | 5 min no input | Auto-disconnect, toast notification |
| Token expired | Redis TTL (2h) | Connection error, "Session expired" message |
| Machine stopped | API stops sandbox | Connection error, task status updates |
| Network error | Wi-Fi drops | Auto-reconnect attempts, then manual retry |

---

## 9. Performance Optimization

### 9.1 x11vnc Optimizations

**ncache (Client-Side Pixel Caching):**

The `-ncache 10` flag is the single biggest performance optimization. It allocates 10x the screen size as pixel cache:

- Without ncache: Every window raise requires re-encoding and transmitting all pixels (~6 MB uncompressed per full screen)
- With ncache: Previously-seen windows are cached on the client. Window switch sends a CopyRect operation (~few bytes) instead of full pixel data

Memory cost: ~60 MB on both client and server. This is acceptable for a dedicated sandbox machine.

**XDAMAGE Extension:**

x11vnc uses the X11 DAMAGE extension to receive notifications about which screen regions changed. Without DAMAGE, x11vnc must poll the entire framebuffer at regular intervals. With DAMAGE:

- CPU usage drops significantly (only encodes changed regions)
- Latency improves (changes detected immediately, no polling interval)
- Battery usage on client devices is lower

**Thread Mode:**

`-threads` enables multi-threaded connection handling. Each VNC client gets its own thread for encoding and sending. This prevents a slow spectator client from blocking the control client's updates.

### 9.2 Encoding and Compression

noVNC supports several encodings. The RFB protocol negotiates the best encoding supported by both client and server:

| Encoding | Bandwidth | CPU (Server) | CPU (Client) | Best For |
|----------|-----------|-------------|-------------|----------|
| Tight | Low | Medium | Low | General use (default) |
| ZRLE | Low | High | Medium | Static content |
| Hextile | Medium | Low | Low | LAN connections |
| Raw | Very High | None | None | Localhost only |
| CopyRect | Minimal | None | None | Window moves (ncache) |

**Our settings:**

```
qualityLevel: 6   (JPEG quality for Tight encoding, 0-9)
compressionLevel: 2 (zlib compression, 0-9)
```

- `qualityLevel=6`: Balanced quality. Text is readable, images look acceptable. Lower values (3-4) save bandwidth but blur text. Higher values (8-9) waste bandwidth for marginal quality gain.
- `compressionLevel=2`: Light compression. Fast encoding with decent compression ratio. Higher values (6-9) save bandwidth but significantly increase server CPU usage.

### 9.3 Bandwidth Estimation

For a typical job application form interaction:

| Activity | Bandwidth (Tight, q=6, c=2) |
|----------|------------------------------|
| Idle (no changes) | ~0 KB/s |
| Text input (typing) | 5-15 KB/s |
| Page scroll | 50-200 KB/s |
| Page navigation | 100-500 KB/s (burst) |
| Full page load | 200 KB - 1 MB (burst) |
| Sustained interaction | ~50 KB/s average |

With ncache, repeated page views (e.g., going back to a previously loaded page) are nearly free.

### 9.4 Adaptive Quality

For users on slow connections, the React app could detect connection quality and adjust:

```typescript
// Future enhancement: adaptive quality
const handleSlowConnection = () => {
  if (vncRef.current?.rfb) {
    vncRef.current.rfb.qualityLevel = 3;  // Lower quality
    vncRef.current.rfb.compressionLevel = 6; // Higher compression
  }
};
```

This is a future enhancement. For MVP, fixed quality settings work well.

### 9.5 TigerVNC as Alternative

TigerVNC is a modern, actively maintained VNC server that is generally faster than x11vnc for encoding. It supports:

- Tight encoding with JPEG
- Hardware-accelerated encoding (when GPU available)
- Better multi-threaded encoding

**Why we still use x11vnc:** TigerVNC creates its own X11 display (`Xtigervnc`), which would replace Xvfb. However, x11vnc's `-ncache` feature is unique and provides significant performance benefits for our use case (frequent window switching). TigerVNC does not support ncache.

**When to switch:** If ncache proves problematic (visual artifacts, memory issues), TigerVNC is a drop-in replacement for x11vnc + Xvfb:

```bash
# Replace Xvfb + x11vnc with single process:
Xtigervnc :99 -geometry 1920x1080 -depth 24 -rfbport 5900 -SecurityTypes None
```

---

## 10. Full Code Examples

### 10.1 supervisord.conf

See [Section 3](#3-supervisord-configuration) for the complete file.

### 10.2 entrypoint.sh

See [Section 4](#4-entrypointsh) for the complete file.

### 10.3 React VNC Component (TSX)

See [Section 6.2](#62-vnc-viewer-component) for the complete `VncViewer` component and [Section 6.3](#63-integration-with-task-detail-page) for the `VncTakeoverPanel`.

### 10.4 API VNC Endpoint

```typescript
// apps/api/src/routes/vnc.ts

import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";

export async function vncRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/vnc/:taskId
   *
   * Returns VNC connection credentials for a task's sandbox.
   * Requires JWT auth + task ownership.
   */
  app.get<{
    Params: { taskId: string };
  }>("/api/v1/vnc/:taskId", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { taskId } = request.params;
      const userId = request.user.id;

      // Verify task ownership
      const { taskRepo, redis } = app.cradle;
      const task = await taskRepo.findById(taskId);

      if (!task || task.userId !== userId) {
        return reply.code(404).send({
          error: "Task not found or you do not have access.",
        });
      }

      // Check sandbox exists and is running
      const sandboxKey = `sandbox:${taskId}`;
      const [machineId, vncToken, status] = await Promise.all([
        redis.hget(sandboxKey, "machineId"),
        redis.hget(sandboxKey, "vncToken"),
        redis.hget(sandboxKey, "status"),
      ]);

      if (!machineId || !vncToken || status !== "running") {
        return reply.code(404).send({
          error: "No active browser session for this task.",
        });
      }

      // Extend session TTL on access
      await redis.expire(sandboxKey, 7200);

      return reply.send({
        wsUrl: `wss://${request.hostname}/api/v1/vnc/${taskId}/ws`,
        token: vncToken,
        machineId,
      });
    },
  });

  /**
   * GET /api/v1/vnc/:taskId/ws
   *
   * WebSocket proxy endpoint. Uses fly-replay to route the
   * connection to the correct sandbox machine. websockify on
   * the sandbox handles the actual WebSocket upgrade.
   */
  app.get<{
    Params: { taskId: string };
    Querystring: { token?: string };
  }>("/api/v1/vnc/:taskId/ws", {
    handler: async (request, reply) => {
      const { taskId } = request.params;
      const { token } = request.query;

      if (!token) {
        return reply.code(401).send({ error: "Token required" });
      }

      const { redis } = app.cradle;
      const sandboxKey = `sandbox:${taskId}`;

      const [machineId, storedToken] = await Promise.all([
        redis.hget(sandboxKey, "machineId"),
        redis.hget(sandboxKey, "vncToken"),
      ]);

      if (!machineId || !storedToken) {
        return reply.code(404).send({ error: "Session not found" });
      }

      // Timing-safe token comparison
      if (
        !crypto.timingSafeEqual(
          Buffer.from(token),
          Buffer.from(storedToken)
        )
      ) {
        return reply.code(403).send({ error: "Invalid token" });
      }

      // Route to the sandbox machine via fly-replay
      // The Fly proxy will replay this request (including WS upgrade)
      // to the specified machine instance
      reply.header("fly-replay", `instance=${machineId}`);
      return reply.code(307).send();
    },
  });
}
```

### 10.5 Sandbox Creation (VNC Token Generation)

```typescript
// apps/api/src/services/sandbox.service.ts (excerpt)

import crypto from "node:crypto";
import type { Redis } from "ioredis";

interface CreateSandboxResult {
  machineId: string;
  vncToken: string;
}

export async function createSandbox(
  taskId: string,
  userId: string,
  redis: Redis,
): Promise<CreateSandboxResult> {
  // Generate cryptographically secure VNC token
  const vncToken = crypto.randomBytes(32).toString("hex");

  // Create Fly Machine with VNC_TOKEN env var
  const machine = await flyMachinesApi.create({
    config: {
      image: "registry.fly.io/valet-sandbox:latest",
      env: {
        VNC_TOKEN: vncToken,
        SANDBOX_ID: taskId,
        DISPLAY: ":99",
      },
      services: [
        {
          ports: [{ port: 6080, handlers: ["http"] }],
          protocol: "tcp",
          internal_port: 6080,
        },
      ],
      guest: {
        cpu_kind: "shared",
        cpus: 2,
        memory_mb: 2048,
      },
    },
  });

  // Store sandbox metadata in Redis with 2-hour TTL
  const sandboxKey = `sandbox:${taskId}`;
  await redis
    .multi()
    .hset(sandboxKey, {
      machineId: machine.id,
      vncToken,
      userId,
      status: "starting",
      createdAt: new Date().toISOString(),
    })
    .expire(sandboxKey, 7200) // 2 hours
    .exec();

  return { machineId: machine.id, vncToken };
}
```

### 10.6 WebSocket Auth Middleware (Token Validation at API Layer)

```typescript
// apps/api/src/middleware/vnc-auth.ts

import type { FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";

/**
 * Middleware that validates VNC tokens at the API layer
 * before fly-replay routes the connection to the sandbox.
 */
export async function validateVncToken(
  request: FastifyRequest<{
    Params: { taskId: string };
    Querystring: { token?: string };
  }>,
  reply: FastifyReply,
) {
  const { taskId } = request.params;
  const { token } = request.query;

  if (!token) {
    return reply.code(401).send({ error: "VNC token required" });
  }

  const redis = request.server.cradle.redis;
  const storedToken = await redis.hget(`sandbox:${taskId}`, "vncToken");

  if (!storedToken) {
    return reply.code(404).send({ error: "Session expired or not found" });
  }

  // Timing-safe comparison to prevent timing attacks
  const tokenBuffer = Buffer.from(token);
  const storedBuffer = Buffer.from(storedToken);

  if (
    tokenBuffer.length !== storedBuffer.length ||
    !crypto.timingSafeEqual(tokenBuffer, storedBuffer)
  ) {
    return reply.code(403).send({ error: "Invalid VNC token" });
  }

  // Token is valid -- proceed to fly-replay routing
}
```

### 10.7 Dockerfile Additions (VNC Stack)

```dockerfile
# In the sandbox Dockerfile, install VNC stack:

# VNC display stack
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    supervisor \
    python3 \
    python3-pip \
    novnc \
    websockify \
    && rm -rf /var/lib/apt/lists/*

# Alternatively install websockify via pip for latest version:
# RUN pip3 install websockify

# Copy supervisord config
COPY docker/sandbox/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy entrypoint
COPY docker/sandbox/entrypoint.sh /opt/scripts/entrypoint.sh
RUN chmod +x /opt/scripts/entrypoint.sh

# Copy health reporter
COPY docker/sandbox/health-reporter.sh /opt/scripts/health-reporter.sh
RUN chmod +x /opt/scripts/health-reporter.sh

# Expose websockify port (VNC over WebSocket)
EXPOSE 6080

ENTRYPOINT ["/opt/scripts/entrypoint.sh"]
```

---

## Appendix: File Locations

When implemented, the VNC stack files will live at:

```
docker/sandbox/
  supervisord.conf          # Process manager config
  entrypoint.sh             # Container entrypoint
  health-reporter.sh        # Health check script

apps/api/src/routes/
  vnc.ts                    # VNC credential + fly-replay endpoints

apps/api/src/middleware/
  vnc-auth.ts               # Token validation middleware

apps/api/src/services/
  sandbox.service.ts         # Sandbox creation (token generation)

apps/web/src/features/tasks/components/
  vnc-viewer.tsx            # noVNC React component
  vnc-takeover-panel.tsx    # Human-needed UI with VNC integration

packages/shared/src/types/
  ws.ts                     # Already has human_needed message type with vncUrl field
```

## Appendix: Dependencies to Add

```bash
# apps/web (React VNC client)
pnpm --filter @valet/web add react-vnc

# apps/api (no new deps -- crypto and ioredis already present)

# Docker image (apt packages)
# xvfb, x11vnc, supervisor, websockify, novnc
```
