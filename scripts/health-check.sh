#!/usr/bin/env bash
# ===========================================================================
# WeKruit Valet - Service Health Check
# ===========================================================================
# Checks connectivity to all external services.
#
# Usage:
#   ./scripts/health-check.sh          # Quick check
#   ./scripts/health-check.sh --wait   # Wait for services to be ready
# ===========================================================================

set -euo pipefail

MAX_RETRIES=15
RETRY_INTERVAL=2
WAIT_MODE=false

if [ "${1:-}" = "--wait" ]; then
  WAIT_MODE=true
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load env vars
if [ -f .env ]; then
  source <(grep -v '^\s*#' .env | grep -v '^\s*$' | sed 's/^/export /')
fi

check_service() {
  local name="$1"
  local command="$2"
  local retries=0

  while true; do
    if eval "$command" >/dev/null 2>&1; then
      echo -e "${GREEN}✓${NC} $name"
      return 0
    fi

    if [ "$WAIT_MODE" = true ] && [ $retries -lt $MAX_RETRIES ]; then
      retries=$((retries + 1))
      echo -e "${YELLOW}…${NC} $name not ready (attempt $retries/$MAX_RETRIES)"
      sleep $RETRY_INTERVAL
    else
      echo -e "${RED}✗${NC} $name"
      return 1
    fi
  done
}

echo ""
echo "=== Service Health Check ==="
echo ""

FAILED=0

# Supabase PostgreSQL (via psql or simple TCP check)
check_service "PostgreSQL (Supabase)" \
  "node -e \"const p=require('postgres');const s=p('${DATABASE_URL:-}');s\\\`SELECT 1\\\`.then(()=>{s.end();process.exit(0)}).catch(()=>process.exit(1))\"" \
  || FAILED=1

# Upstash Redis (TLS connection)
check_service "Redis (Upstash)" \
  "node -e \"const{createClient}=require('redis');const c=createClient({url:'${REDIS_URL:-}'});c.connect().then(()=>c.ping()).then(()=>{c.quit();process.exit(0)}).catch(()=>process.exit(1))\"" \
  || FAILED=1

# Supabase Storage S3
check_service "Storage S3 (Supabase)" \
  "curl -sf --max-time 5 '${S3_ENDPOINT:-http://localhost:9000}' -o /dev/null -w '%{http_code}'" \
  || FAILED=1

echo ""

if [ $FAILED -ne 0 ]; then
  echo -e "${RED}Some services are unhealthy. Check your .env values.${NC}"
  exit 1
fi

echo -e "${GREEN}All services are healthy.${NC}"
