#!/usr/bin/env bash
# ===========================================================================
# WeKruit Valet - Local Development Setup
# ===========================================================================
# Run this once after cloning the repo:
#   ./scripts/setup.sh
#
# What it does:
#   1. Checks prerequisites (node, pnpm)
#   2. Installs dependencies
#   3. Creates .env from template if missing
#   4. Validates required env vars
#   5. Runs database migrations against Supabase
#   6. Builds shared packages
# ===========================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}→${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     WeKruit Valet — Local Dev Setup      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Prerequisites ──
info "Checking prerequisites..."

MISSING=0
for cmd in node pnpm; do
  if command -v "$cmd" &>/dev/null; then
    ok "$cmd $(command $cmd --version 2>/dev/null | head -1)"
  else
    fail "$cmd is required but not installed"
    MISSING=1
  fi
done

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  fail "Node.js 20+ required (found v${NODE_VERSION})"
  MISSING=1
fi

if [ $MISSING -ne 0 ]; then
  echo ""
  fail "Install missing tools and try again."
  echo "  Node.js: https://nodejs.org (v20+)"
  echo "  pnpm:    npm install -g pnpm"
  exit 1
fi
echo ""

# ── 2. Install dependencies ──
info "Installing dependencies..."
pnpm install
ok "Dependencies installed"
echo ""

# ── 3. Environment file ──
if [ ! -f .env ]; then
  cp .env.example .env
  warn "Created .env from .env.example"
  warn "Please fill in the required values, then re-run this script."
  echo ""
  echo "  Required:"
  echo "    DATABASE_URL       — Supabase pooler connection string"
  echo "    DATABASE_DIRECT_URL — Supabase direct connection string"
  echo "    REDIS_URL          — Upstash Redis URL"
  echo "    GOOGLE_CLIENT_ID   — Google OAuth client ID"
  echo "    GOOGLE_CLIENT_SECRET"
  echo "    JWT_SECRET         — openssl rand -base64 48"
  echo "    JWT_REFRESH_SECRET — openssl rand -base64 48"
  echo "    S3_ENDPOINT        — Supabase Storage S3 endpoint"
  echo "    S3_ACCESS_KEY      — Supabase Storage S3 access key"
  echo "    S3_SECRET_KEY      — Supabase Storage S3 secret key"
  echo ""
  exit 0
fi
ok ".env file exists"

# ── 4. Validate required env vars ──
info "Validating environment variables..."

# Read a value from .env by key (handles quoted values with special chars)
env_val() {
  local line
  line=$(grep -E "^$1=" .env | head -1) || true
  local val="${line#*=}"
  # Strip surrounding quotes
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  echo "$val"
}

REQUIRED_VARS=(
  DATABASE_URL
  REDIS_URL
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  JWT_SECRET
  JWT_REFRESH_SECRET
  S3_ENDPOINT
  S3_ACCESS_KEY
  S3_SECRET_KEY
)

PLACEHOLDERS="your-|change-me|PLACEHOLDER|\[project-ref\]|\[password\]|\[endpoint\]"

ENV_OK=1
for var in "${REQUIRED_VARS[@]}"; do
  val=$(env_val "$var")
  if [ -z "$val" ] || echo "$val" | grep -qE "$PLACEHOLDERS"; then
    fail "$var is not set (or still has placeholder value)"
    ENV_OK=0
  else
    ok "$var"
  fi
done

if [ $ENV_OK -eq 0 ]; then
  echo ""
  fail "Fix the variables above in .env and re-run this script."
  exit 1
fi
echo ""

# ── 5. Test database connection ──
info "Testing Supabase connection..."
if pnpm --filter @valet/db db:generate 2>/dev/null; then
  ok "Database connection works"
else
  warn "Could not connect to database — check DATABASE_URL / DATABASE_DIRECT_URL"
  warn "Continuing anyway..."
fi
echo ""

# ── 6. Run database migrations ──
info "Running database migrations..."
pnpm --filter @valet/db db:push
ok "Migrations applied"
echo ""

# ── 7. Build packages ──
info "Building shared packages..."
pnpm turbo build --filter=@valet/shared --filter=@valet/contracts --filter=@valet/db
ok "Packages built"
echo ""

# ── 8. Check Hatchet token ──
HATCHET_TOKEN=$(env_val "HATCHET_CLIENT_TOKEN")
if [ -z "$HATCHET_TOKEN" ] || echo "$HATCHET_TOKEN" | grep -qE "$PLACEHOLDERS"; then
  warn "HATCHET_CLIENT_TOKEN is not set."
  warn "Get it from the Hatchet dashboard → Settings → API Tokens"
  warn "The worker won't start without it, but API and Web will work."
  echo ""
fi

# ── Done ──
echo "╔══════════════════════════════════════════╗"
echo "║           Setup complete!                ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Start development:    pnpm dev"
echo "  Run tests:            pnpm test"
echo "  Type check:           pnpm typecheck"
echo "  DB studio:            pnpm --filter @valet/db db:studio"
echo ""
echo "  Web:    http://localhost:5173"
echo "  API:    http://localhost:8000"
echo "  API docs: http://localhost:8000/docs"
echo ""
