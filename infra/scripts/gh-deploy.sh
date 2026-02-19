#!/usr/bin/env bash
# =============================================================================
# gh-deploy.sh — Deploy GhostHands Docker image on EC2
# =============================================================================
# Called by health-server.js when VALET's DeployService hits POST /deploy.
#
# Usage:
#   bash deploy.sh deploy <image_tag>
#
# Install: Copy to /opt/ghosthands/scripts/deploy.sh on EC2
# =============================================================================
set -euo pipefail

GH_DIR="/opt/ghosthands"
COMPOSE_FILE="${GH_DIR}/docker-compose.yml"
ENV_FILE="${GH_DIR}/.env"
LOG_FILE="/var/log/gh-deploy.log"
HEALTH_TIMEOUT=30
STOP_TIMEOUT=30

log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

get_current_image() {
  if [ -f "$ENV_FILE" ]; then
    grep -E '^GH_IMAGE_TAG=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "unknown"
  else
    echo "unknown"
  fi
}

wait_for_health() {
  local elapsed=0
  log "Waiting for worker health (timeout: ${HEALTH_TIMEOUT}s)..."
  while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
    if docker compose -f "$COMPOSE_FILE" ps --filter status=running --format '{{.Name}}' 2>/dev/null | grep -q worker; then
      # Check if container is healthy (not just running)
      local health
      health=$(docker inspect --format='{{.State.Health.Status}}' "$(docker compose -f "$COMPOSE_FILE" ps -q worker 2>/dev/null)" 2>/dev/null || echo "none")
      if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
        # "none" means no healthcheck defined — container running is sufficient
        log "Worker container is running (health: $health)"
        return 0
      fi
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

do_deploy() {
  local image_tag="$1"
  local previous_tag
  previous_tag=$(get_current_image)

  log "=== Starting deploy ==="
  log "New image tag: $image_tag"
  log "Previous image tag: $previous_tag"

  cd "$GH_DIR"

  # Step 1: Update image tag in .env
  if [ -f "$ENV_FILE" ]; then
    if grep -q '^GH_IMAGE_TAG=' "$ENV_FILE"; then
      sed -i "s|^GH_IMAGE_TAG=.*|GH_IMAGE_TAG=${image_tag}|" "$ENV_FILE"
    else
      echo "GH_IMAGE_TAG=${image_tag}" >> "$ENV_FILE"
    fi
  else
    echo "GH_IMAGE_TAG=${image_tag}" > "$ENV_FILE"
  fi

  # Step 2: Pull new image
  log "Pulling image..."
  if ! docker compose -f "$COMPOSE_FILE" pull worker 2>&1; then
    log "ERROR: Failed to pull image. Reverting .env."
    sed -i "s|^GH_IMAGE_TAG=.*|GH_IMAGE_TAG=${previous_tag}|" "$ENV_FILE"
    exit 1
  fi

  # Step 3: Stop worker gracefully (SIGTERM with timeout)
  log "Stopping worker (timeout: ${STOP_TIMEOUT}s)..."
  docker compose -f "$COMPOSE_FILE" stop -t "$STOP_TIMEOUT" worker 2>&1 || true

  # Step 4: Start worker with new image
  log "Starting worker with new image..."
  docker compose -f "$COMPOSE_FILE" up -d worker 2>&1

  # Step 5: Health check
  if wait_for_health; then
    log "=== Deploy successful: $image_tag ==="
  else
    log "ERROR: Health check failed. Rolling back to $previous_tag..."

    # Rollback
    sed -i "s|^GH_IMAGE_TAG=.*|GH_IMAGE_TAG=${previous_tag}|" "$ENV_FILE"
    docker compose -f "$COMPOSE_FILE" stop -t 10 worker 2>&1 || true
    docker compose -f "$COMPOSE_FILE" pull worker 2>&1 || true
    docker compose -f "$COMPOSE_FILE" up -d worker 2>&1

    log "Rollback complete. Running: $previous_tag"
    exit 1
  fi
}

# ── Main ──────────────────────────────────────────────────
case "${1:-}" in
  deploy)
    if [ -z "${2:-}" ]; then
      echo "Usage: $0 deploy <image_tag>"
      exit 1
    fi
    do_deploy "$2"
    ;;
  *)
    echo "Usage: $0 deploy <image_tag>"
    exit 1
    ;;
esac
